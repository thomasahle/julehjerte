import { describe, it, expect, beforeEach } from 'vitest';
import {
	snapSequentialQPBezierControl,
	snapSequentialQPBezierJunction,
	snapSequentialQP,
	createControlSampler,
	createJunctionSampler,
	nearestObstacle,
	type SquareBounds
} from './snapBezierControl';

// Mock Paper.js Point class with all required methods
class MockPoint {
	x: number;
	y: number;

	constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	add(other: MockPoint): MockPoint {
		return new MockPoint(this.x + other.x, this.y + other.y);
	}

	subtract(other: MockPoint): MockPoint {
		return new MockPoint(this.x - other.x, this.y - other.y);
	}

	multiply(scalar: number): MockPoint {
		return new MockPoint(this.x * scalar, this.y * scalar);
	}

	dot(other: MockPoint): number {
		return this.x * other.x + this.y * other.y;
	}

	getDistance(other: MockPoint): number {
		const dx = this.x - other.x;
		const dy = this.y - other.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	get length(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}

	normalize(): MockPoint {
		const len = this.length;
		if (len < 1e-9) return new MockPoint(0, 0);
		return new MockPoint(this.x / len, this.y / len);
	}

	clone(): MockPoint {
		return new MockPoint(this.x, this.y);
	}
}

// Mock Paper.js Path class for obstacles
class MockPath {
	private points: MockPoint[];

	constructor(points: MockPoint[]) {
		this.points = points;
	}

	getNearestLocation(point: MockPoint): { point: MockPoint; distance: number } | null {
		if (this.points.length < 2) return null;

		let nearestPoint = this.points[0];
		let minDist = point.getDistance(this.points[0]);

		// Simplified: just check distance to each point on the path
		// For a real implementation, we'd check line segments
		for (let i = 0; i < this.points.length - 1; i++) {
			const p1 = this.points[i];
			const p2 = this.points[i + 1];

			// Project point onto line segment
			const dx = p2.x - p1.x;
			const dy = p2.y - p1.y;
			const lenSq = dx * dx + dy * dy;

			if (lenSq > 0) {
				let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lenSq;
				t = Math.max(0, Math.min(1, t));

				const projX = p1.x + t * dx;
				const projY = p1.y + t * dy;
				const proj = new MockPoint(projX, projY);
				const dist = point.getDistance(proj);

				if (dist < minDist) {
					minDist = dist;
					nearestPoint = proj;
				}
			}
		}

		return { point: nearestPoint, distance: minDist };
	}
}

// Helper to create a simple bezier curve (straight line)
function createStraightBezier(
	start: MockPoint,
	end: MockPoint
): { p0: MockPoint; p1: MockPoint; p2: MockPoint; p3: MockPoint } {
	const third = end.subtract(start).multiply(1 / 3);
	return {
		p0: start,
		p1: start.add(third),
		p2: start.add(third.multiply(2)),
		p3: end
	};
}

describe('nearestObstacle', () => {
	it('returns infinite distance for empty obstacles', () => {
		const point = new MockPoint(50, 50);
		const result = nearestObstacle(point as any, []);
		expect(result.dist).toBe(Infinity);
	});

	it('finds nearest point on single obstacle', () => {
		const point = new MockPoint(50, 60);
		const obstaclePath = new MockPath([new MockPoint(0, 50), new MockPoint(100, 50)]);

		const result = nearestObstacle(point as any, [obstaclePath as any]);
		expect(result.dist).toBeCloseTo(10, 1);
	});

	it('returns closest of multiple obstacles', () => {
		const point = new MockPoint(50, 55);
		const farObstacle = new MockPath([new MockPoint(0, 100), new MockPoint(100, 100)]);
		const nearObstacle = new MockPath([new MockPoint(0, 50), new MockPoint(100, 50)]);

		const result = nearestObstacle(point as any, [farObstacle as any, nearObstacle as any]);
		expect(result.dist).toBeCloseTo(5, 1);
	});
});

describe('snapSequentialQPBezierControl', () => {
	const square: SquareBounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };

	it('returns desired position when valid and no obstacles', () => {
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(60, 60);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = () => true;

		const result = snapSequentialQPBezierControl(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			'p1',
			new MockPoint(0, 0) as any,
			new MockPoint(50, 100) as any,
			new MockPoint(100, 0) as any,
			[],
			square
		);

		expect(result.point.x).toBeCloseTo(60, 0);
		expect(result.point.y).toBeCloseTo(60, 0);
	});

	it('stays at from position when desired is invalid', () => {
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(60, 60);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		// Reject any position except from
		const isValidCandidate = (c: { pos: MockPoint }) =>
			c.pos.x === from.x && c.pos.y === from.y;

		const result = snapSequentialQPBezierControl(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			'p1',
			new MockPoint(0, 0) as any,
			new MockPoint(50, 100) as any,
			new MockPoint(100, 0) as any,
			[],
			square
		);

		expect(result.point.x).toBeCloseTo(50, 0);
		expect(result.point.y).toBeCloseTo(50, 0);
	});

	it('respects obstacles when snapping', () => {
		const from = new MockPoint(50, 40);
		const desired = new MockPoint(50, 80);

		// Create an obstacle at y=60
		const obstacle = new MockPath([new MockPoint(0, 60), new MockPoint(100, 60)]);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		// Use distance to obstacle line as validation
		const isValidCandidate = (c: { pos: MockPoint }) => {
			// Point is valid if it's above y=55 (with some margin from obstacle at y=60)
			return c.pos.y < 55;
		};

		const result = snapSequentialQPBezierControl(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			'p1',
			new MockPoint(0, 0) as any,
			new MockPoint(50, 100) as any,
			new MockPoint(100, 0) as any,
			[obstacle as any],
			square
		);

		// Should not cross y=55
		expect(result.point.y).toBeLessThan(56);
	});

	it('works with p2 control point', () => {
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(70, 50);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = () => true;

		const result = snapSequentialQPBezierControl(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			'p2',
			new MockPoint(0, 0) as any,
			new MockPoint(30, 50) as any, // p1 when control is p2
			new MockPoint(100, 0) as any,
			[],
			square
		);

		expect(result.point.x).toBeCloseTo(70, 0);
		expect(result.point.y).toBeCloseTo(50, 0);
	});

	it('respects square bounds', () => {
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(150, 50); // Outside bounds

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = (c: { pos: MockPoint }) => {
			return c.pos.x <= 100; // Must stay within bounds
		};

		const result = snapSequentialQPBezierControl(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			'p1',
			new MockPoint(0, 0) as any,
			new MockPoint(50, 100) as any,
			new MockPoint(100, 0) as any,
			[],
			square
		);

		expect(result.point.x).toBeLessThanOrEqual(100);
	});
});

describe('snapSequentialQPBezierJunction', () => {
	const square: SquareBounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };

	it('returns desired position when valid and no obstacles', () => {
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(60, 50);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = () => true;

		// Previous segment: p0, p1, p2, with junction at p3
		const prevP0 = new MockPoint(0, 50);
		const prevP1 = new MockPoint(20, 50);
		const prevP2 = new MockPoint(40, 50);

		// Next segment: junction at p0, p1, p2, p3
		const nextP1 = new MockPoint(60, 50);
		const nextP2 = new MockPoint(80, 50);
		const nextP3 = new MockPoint(100, 50);

		const result = snapSequentialQPBezierJunction(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			prevP0 as any,
			prevP1 as any,
			prevP2 as any,
			nextP1 as any,
			nextP2 as any,
			nextP3 as any,
			[],
			square
		);

		expect(result.point.x).toBeCloseTo(60, 0);
		expect(result.point.y).toBeCloseTo(50, 0);
	});

	it('stays at from position when desired is invalid', () => {
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(60, 50);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = (c: { pos: MockPoint }) =>
			c.pos.x === from.x && c.pos.y === from.y;

		const prevP0 = new MockPoint(0, 50);
		const prevP1 = new MockPoint(20, 50);
		const prevP2 = new MockPoint(40, 50);
		const nextP1 = new MockPoint(60, 50);
		const nextP2 = new MockPoint(80, 50);
		const nextP3 = new MockPoint(100, 50);

		const result = snapSequentialQPBezierJunction(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			prevP0 as any,
			prevP1 as any,
			prevP2 as any,
			nextP1 as any,
			nextP2 as any,
			nextP3 as any,
			[],
			square
		);

		expect(result.point.x).toBeCloseTo(50, 0);
		expect(result.point.y).toBeCloseTo(50, 0);
	});

	it('respects obstacles when snapping junction', () => {
		const from = new MockPoint(50, 40);
		const desired = new MockPoint(50, 80);

		const obstacle = new MockPath([new MockPoint(0, 60), new MockPoint(100, 60)]);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = (c: { pos: MockPoint }) => c.pos.y < 55;

		const prevP0 = new MockPoint(0, 40);
		const prevP1 = new MockPoint(20, 40);
		const prevP2 = new MockPoint(40, 40);
		const nextP1 = new MockPoint(60, 40);
		const nextP2 = new MockPoint(80, 40);
		const nextP3 = new MockPoint(100, 40);

		const result = snapSequentialQPBezierJunction(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			prevP0 as any,
			prevP1 as any,
			prevP2 as any,
			nextP1 as any,
			nextP2 as any,
			nextP3 as any,
			[obstacle as any],
			square
		);

		expect(result.point.y).toBeLessThan(56);
	});

	it('handles both prev and next curve constraints', () => {
		// Junction at (50, 50), moving toward (50, 70)
		// Both prev and next curves should affect the constraints
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(50, 70);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = () => true;

		const prevP0 = new MockPoint(0, 50);
		const prevP1 = new MockPoint(20, 50);
		const prevP2 = new MockPoint(40, 50);
		const nextP1 = new MockPoint(60, 50);
		const nextP2 = new MockPoint(80, 50);
		const nextP3 = new MockPoint(100, 50);

		const result = snapSequentialQPBezierJunction(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			prevP0 as any,
			prevP1 as any,
			prevP2 as any,
			nextP1 as any,
			nextP2 as any,
			nextP3 as any,
			[],
			square
		);

		// Should reach desired since no obstacles
		expect(result.point.x).toBeCloseTo(50, 0);
		expect(result.point.y).toBeCloseTo(70, 0);
	});
});

describe('unified snapSequentialQP equivalence', () => {
	const square: SquareBounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };

	it('unified with control sampler matches snapSequentialQPBezierControl', () => {
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(70, 70);
		const p0 = new MockPoint(0, 0);
		const fixedOther = new MockPoint(50, 100); // p2 when control is p1
		const p3 = new MockPoint(100, 0);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = () => true;

		// Original function
		const originalResult = snapSequentialQPBezierControl(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			'p1',
			p0 as any,
			fixedOther as any,
			p3 as any,
			[],
			square
		);

		// Unified function with control sampler
		const sampler = createControlSampler('p1', p0 as any, fixedOther as any, p3 as any);
		const unifiedResult = snapSequentialQP(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			sampler,
			[],
			square
		);

		expect(unifiedResult.point.x).toBeCloseTo(originalResult.point.x, 5);
		expect(unifiedResult.point.y).toBeCloseTo(originalResult.point.y, 5);
	});

	it('unified with junction sampler matches snapSequentialQPBezierJunction', () => {
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(60, 60);

		const prevP0 = new MockPoint(0, 50);
		const prevP1 = new MockPoint(20, 50);
		const prevP2 = new MockPoint(40, 50);
		const nextP1 = new MockPoint(60, 50);
		const nextP2 = new MockPoint(80, 50);
		const nextP3 = new MockPoint(100, 50);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = () => true;

		// Original function
		const originalResult = snapSequentialQPBezierJunction(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			prevP0 as any,
			prevP1 as any,
			prevP2 as any,
			nextP1 as any,
			nextP2 as any,
			nextP3 as any,
			[],
			square
		);

		// Unified function with junction sampler
		const sampler = createJunctionSampler(
			prevP0 as any,
			prevP1 as any,
			prevP2 as any,
			from as any,
			nextP1 as any,
			nextP2 as any,
			nextP3 as any
		);
		const unifiedResult = snapSequentialQP(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			sampler,
			[],
			square
		);

		expect(unifiedResult.point.x).toBeCloseTo(originalResult.point.x, 5);
		expect(unifiedResult.point.y).toBeCloseTo(originalResult.point.y, 5);
	});

	it('unified with control sampler matches with obstacles', () => {
		const from = new MockPoint(50, 40);
		const desired = new MockPoint(50, 80);
		const p0 = new MockPoint(0, 40);
		const fixedOther = new MockPoint(50, 100);
		const p3 = new MockPoint(100, 40);

		const obstacle = new MockPath([new MockPoint(0, 60), new MockPoint(100, 60)]);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = (c: { pos: MockPoint }) => c.pos.y < 58;

		// Original function
		const originalResult = snapSequentialQPBezierControl(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			'p1',
			p0 as any,
			fixedOther as any,
			p3 as any,
			[obstacle as any],
			square
		);

		// Unified function with control sampler
		const sampler = createControlSampler('p1', p0 as any, fixedOther as any, p3 as any);
		const unifiedResult = snapSequentialQP(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			sampler,
			[obstacle as any],
			square
		);

		expect(unifiedResult.point.x).toBeCloseTo(originalResult.point.x, 3);
		expect(unifiedResult.point.y).toBeCloseTo(originalResult.point.y, 3);
	});

	it('unified with junction sampler matches with obstacles', () => {
		const from = new MockPoint(50, 40);
		const desired = new MockPoint(50, 80);

		const prevP0 = new MockPoint(0, 40);
		const prevP1 = new MockPoint(20, 40);
		const prevP2 = new MockPoint(40, 40);
		const nextP1 = new MockPoint(60, 40);
		const nextP2 = new MockPoint(80, 40);
		const nextP3 = new MockPoint(100, 40);

		const obstacle = new MockPath([new MockPoint(0, 60), new MockPoint(100, 60)]);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = (c: { pos: MockPoint }) => c.pos.y < 58;

		// Original function
		const originalResult = snapSequentialQPBezierJunction(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			prevP0 as any,
			prevP1 as any,
			prevP2 as any,
			nextP1 as any,
			nextP2 as any,
			nextP3 as any,
			[obstacle as any],
			square
		);

		// Unified function with junction sampler
		const sampler = createJunctionSampler(
			prevP0 as any,
			prevP1 as any,
			prevP2 as any,
			from as any,
			nextP1 as any,
			nextP2 as any,
			nextP3 as any
		);
		const unifiedResult = snapSequentialQP(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			sampler,
			[obstacle as any],
			square
		);

		expect(unifiedResult.point.x).toBeCloseTo(originalResult.point.x, 3);
		expect(unifiedResult.point.y).toBeCloseTo(originalResult.point.y, 3);
	});
});

describe('control vs junction consistency', () => {
	const square: SquareBounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 };

	it('both functions converge for same obstacle configuration', () => {
		// This test verifies that both functions handle obstacles similarly
		const from = new MockPoint(50, 40);
		const desired = new MockPoint(50, 80);
		const obstacle = new MockPath([new MockPoint(0, 60), new MockPoint(100, 60)]);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = (c: { pos: MockPoint }) => c.pos.y < 58;

		// Test control point
		const controlResult = snapSequentialQPBezierControl(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			'p1',
			new MockPoint(0, 40) as any,
			new MockPoint(50, 100) as any,
			new MockPoint(100, 40) as any,
			[obstacle as any],
			square
		);

		// Test junction
		const junctionResult = snapSequentialQPBezierJunction(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			new MockPoint(0, 40) as any,
			new MockPoint(20, 40) as any,
			new MockPoint(40, 40) as any,
			new MockPoint(60, 40) as any,
			new MockPoint(80, 40) as any,
			new MockPoint(100, 40) as any,
			[obstacle as any],
			square
		);

		// Both should respect the obstacle
		expect(controlResult.point.y).toBeLessThan(59);
		expect(junctionResult.point.y).toBeLessThan(59);
	});

	it('both functions iterate and report iterations', () => {
		const from = new MockPoint(50, 50);
		const desired = new MockPoint(60, 60);

		const buildCandidateAt = (pos: MockPoint) => ({ pos });
		const isValidCandidate = () => true;

		const controlResult = snapSequentialQPBezierControl(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			'p1',
			new MockPoint(0, 0) as any,
			new MockPoint(50, 100) as any,
			new MockPoint(100, 0) as any,
			[],
			square
		);

		const junctionResult = snapSequentialQPBezierJunction(
			buildCandidateAt as any,
			from as any,
			desired as any,
			isValidCandidate,
			new MockPoint(0, 50) as any,
			new MockPoint(20, 50) as any,
			new MockPoint(40, 50) as any,
			new MockPoint(60, 50) as any,
			new MockPoint(80, 50) as any,
			new MockPoint(100, 50) as any,
			[],
			square
		);

		// Both should report at least 1 iteration
		expect(controlResult.iterations).toBeGreaterThanOrEqual(1);
		expect(junctionResult.iterations).toBeGreaterThanOrEqual(1);
	});
});
