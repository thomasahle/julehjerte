import { writable, derived, get } from 'svelte/store';
import type { EditorState, EditorMode, Point } from '../types';

// Initial editor state
const initialState: EditorState = {
  mode: 'select',
  selectedPathId: null,
  selectedPointIndex: null,
  isDrawing: false,
  drawingPoints: []
};

// Create the editor state store
function createEditorStore() {
  const { subscribe, set, update } = writable<EditorState>(initialState);

  return {
    subscribe,
    set,
    update,

    // Set the editor mode
    setMode: (mode: EditorMode) => {
      update(state => ({
        ...state,
        mode,
        // Clear selection when changing modes
        selectedPathId: mode === 'select' ? state.selectedPathId : null,
        selectedPointIndex: null,
        isDrawing: false,
        drawingPoints: []
      }));
    },

    // Select a path
    selectPath: (pathId: string | null) => {
      update(state => ({
        ...state,
        selectedPathId: pathId,
        selectedPointIndex: null
      }));
    },

    // Select a specific control point
    selectPoint: (pathId: string, pointIndex: number) => {
      update(state => ({
        ...state,
        selectedPathId: pathId,
        selectedPointIndex: pointIndex
      }));
    },

    // Clear selection
    clearSelection: () => {
      update(state => ({
        ...state,
        selectedPathId: null,
        selectedPointIndex: null
      }));
    },

    // Start drawing a new path
    startDrawing: (point: Point) => {
      update(state => ({
        ...state,
        isDrawing: true,
        drawingPoints: [point]
      }));
    },

    // Add a point while drawing
    addDrawingPoint: (point: Point) => {
      update(state => ({
        ...state,
        drawingPoints: [...state.drawingPoints, point]
      }));
    },

    // Finish drawing
    finishDrawing: () => {
      const state = get({ subscribe });
      const points = state.drawingPoints;

      update(s => ({
        ...s,
        isDrawing: false,
        drawingPoints: [],
        mode: 'select' // Return to select mode after drawing
      }));

      return points;
    },

    // Cancel drawing
    cancelDrawing: () => {
      update(state => ({
        ...state,
        isDrawing: false,
        drawingPoints: []
      }));
    },

    // Reset to initial state
    reset: () => {
      set(initialState);
    }
  };
}

export const editorStore = createEditorStore();

// Derived store for whether we're in an active editing state
export const isEditing = derived(editorStore, $editor =>
  $editor.selectedPathId !== null || $editor.isDrawing
);

// Derived store for the current mode name (for display)
export const modeName = derived(editorStore, $editor => {
  switch ($editor.mode) {
    case 'select': return 'Select';
    case 'draw': return 'Draw';
    case 'addPoint': return 'Add Point';
    default: return 'Unknown';
  }
});
