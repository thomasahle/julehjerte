# Simulated weave: status and how to resume

## Pipeline
    python3 unweave.py DESIGN OUT.npz [--area 0.03] [--iters 5] [--hand 1] [--pinch 1] [--only K] [--stop K] [--resume OUT.ckNN.npz] [--nocheck]
        DESIGN = classic3 | classicN | juleflet .svg.  Writes OUT.npz after every crossing and a checkpoint OUT.ckNN.npz
        (state after NN crossings; --resume continues from one, reading the frames so far from the run that wrote it).
    python3 verify.py OUT.npz [step]            independent whole-mesh check of stored frames (single precision)
    python3 pack.py OUT.npz OUT.jhb [every] [--log RUN.log]   compact file for the browser (handles the reversal, writes
                                                the step captions and, with --log, the run statistics)
    viewer.html                                 interactive playback of .jhb files (rotate, zoom, steps)
    python3 play.py video OUT.jhb OUT.mp4       or: play.py stills OUT.jhb PREFIX t[:yaw:tilt:zoom] ...   (player.html + three.js)
    python3 view.py OUT.npz PREFIX frame:yaw:tilt:dist[:cx:cy:cz] ...   debug stills by (reverse) frame number; sheet.py tiles them
    python3 labels.py OUT.npz                   stage names by frame
    ./run_all.sh HEARTS_DIR OUT_DIR [JOBS]      every SVG in a folder, with a summary table
Needs: numpy scipy ipctk triangle shapely svgelements (pypardiso optional; playwright, ffmpeg, pillow for stills and video).

## How unweave.py works
- Both halves are meshed as real cut sheets from the SVG, snapped to a 0.004 grid first (otherwise curved cuts of the two
  halves crossing at shallow angles give micro-triangles). Other half's cuts are imprinted as thin bands.
- Starts from the finished weave and undoes crossings in reverse order; played backwards that is the weaving.
- Paper: edge springs (KS 1200, a bit rubbery on purpose), hinge bending, drag, IPC barrier + CCD. Every frame is checked
  for intersections on the whole mesh in double precision (--nocheck to skip).
- Only free ends in play move. `Local` is rebuilt per frame from the moving vertices and the still triangles within reach.
- Fingers: `Block` = a stretch of strip held flat between two fingers (rest shape, so held paper is tidy); `pose`/`swing` =
  a light hand along a whole strip keeping it paper-straight at a given angle; `press`/`flat_home` = held flat on the table;
  traction at a loop mouth for drawing a strip out.

## What made doubling-back cuts work (in the order found)
1. Free length = distance to the NEAREST still-woven point (`free_len`), not the furthest. With curved cuts the last crossing
   reaches further along a strip in some places; a strip can only bend up along a straight line short of all of it.
2. Draw-out by traction only: every point of the strip near the loop mouth is pulled toward the root and up; the slack stands
   up as a loop over the slit and the folded end follows last. (The old rigid "lift at base" needed the host loop to open
   0.3 high, impossible for short loops.) Ends when every point of the folded end has come up through the mouth; paced at
   finger speed.
3. Tucking (`tuck`): a strip with knobs is narrowed sideways (to ~0.55 for the jigsaw, computed per strip so the knobs fit
   inside the lane; nothing for straight cuts) ONLY on the part that is inside the loop it is passing through, plus 0.3
   either side and below 0.4 height. What stands free keeps its full shape. An earlier version pinched the whole free end
   (`squeeze`/`pinch`, still in the file, unused): the user found that too visible. `--pinch 0` turns narrowing off
   entirely: it still weaves without intersections, but strips crumple more on the way through.
4. In-plane jigsaw interlock: free white ends lying on the table are locked into each other. So a white end is lifted off
   the table (rotating about the loop mouth) before it is pinched and drawn, and laid down again from above.
5. A drawn-out white end stays held up until the whole row is undone and the red strip is folded back; then all held white
   ends are let go and lowered together. (Laid down earlier, it ended up between the red strip's layers again.)
6. Folded-back red strips and the final laying-out use `swing`, so they end as a flat jigsaw sheet; white strips settle flat
   in the same last stage.

7. The receiving strip helps (`draw_out`, GAMMA/ROLL/YAW): before a strip is threaded into it, the host strip rises about 20
   degrees, its lobe-side edge tilted up and swung a few degrees aside, and settles again afterwards (a red host comes down
   from standing to that low position and goes back up to wait for its next crossing). User asked for this back.
8. A strip is "out" of a loop only when its folded end has actually been between the host's two layers and has left them
   (`inside`): a wide end can flip over the top of a short loop without going through it.
9. `rail`: the part of a WHITE strip still to go into a loop is kept in its own plane (30 degrees up from the far mouth) and
   led down it, so it is fed through rather than rotating up about its anchor with the loop riding on its back. The target
   must be a little AHEAD of each point: a spring to where a point already is acts as a brake within the step. For red ends
   (standing from the last crossing) this made things worse, so they are left to fall in as before.
10. Reader (`cutmesh.load_cuts`) now reads hearts as juleflet does: any colour, group transforms applied, viewBox square,
    direction of a cut decides the half. Heights in the finished weave come from the triangles a point belongs to, and the
    other half's cut lines are not drawn into the mesh where they run ALONG this half's own cuts (Uret's ring is made of
    arcs shared by both halves).

11. Travelling hand (`draw_out`, default; `--hand 0` for the old way): instead of pulling whatever paper is at the mouth
    of the loop, a hand grips the strip where it comes out and carries that point to where it will be when the strip stands
    clear, then the next bit, and so on up the strip (`pulled` advances only when the gripped span has arrived), while a
    light hand keeps what is already out straight. Result on the jigsaw: no crumpled pile at the loop, most stretch 20%
    instead of 36-55%, about 20% more frames.
12. If the hand does not get the strip out (`out` still false when it has travelled the whole length), the state is put
    back to before the draw and the strip is pulled out by traction instead (item 2). Logged as "slipped out of the hand".
13. Magic (`ghost`, `rejoin`, `force`): if the strip is still not out, or a strip is more than 0.35 from where it should be
    held after a lift or fold, it stops colliding (it is no obstacle and nothing is an obstacle to it), is carried to where
    it belongs, and collides again as soon as it intersects nothing. Nothing stops or fails because a strip is stuck. The
    log names each strip and the summary counts strips and frames; frames with a ghost are not counted as intersecting.
14. Labels are `TAG|stage name`, TAG = `n,m,R` / `n,m,W` (crossing of red n and white m, R or W is the strip that goes
    inside), `row,n`, `start`; pack.py turns runs of equal TAG into the viewer's step captions.

15. Curl (`shape`, `--curl 0.4`): a held strip is not a straight board. It still turns up in a tight bend where it leaves the
    weave (the strip it has just come out of lies right beside it, so there is no room for a wide bend there: `--rbend 0.35`
    made the hand lose strips even on the classic heart), and from there it curves gently on, so that its end is CURL x its
    angle further round than its base (105 degrees at the base, about 147 at the end). `hover` (the held blocks) and `pose`
    (the light hand) both follow that one curve. The base angle must stay where it was: with the curl centred on the old
    angle (`--curlb 0.5`: base 79 degrees, leaning over the loop it came out of) the jigsaw's first row needed four second
    tries and one magic pass; with `--curlb 0` it is clean again.
16. The film around the weave is hand-made and lives in the viewer, as in the first tutorial page: two strips, fold, pencil
    line and scissors for the rounded end and for each cut, laying the halves out; after the weave a handle, and the heart
    lifts, stands up, opens a little and turns. For that the run saves each point's place on its flat half (`rest`), the cut
    lines and a few constants, and pack.py adds, for the points along a cut, where they sit while the cut is still closed
    (`kc`, `kd`, `kf`) and the red half's distance in the first frame (`redoff`). The viewer moves the same mesh: cuts open
    behind the scissors, the top layer is hinged on the fold, and over the last 0.6 s of laying out it blends into the first
    simulated frame. Scissor time per cut grows with the cut's length.

## Results (2-core sandbox, two runs side by side)
- puslespil.svg (4x4 jigsaw), --area 0.03 --iters 5: 16 crossings, 2518 frames, 1457 s, no second tries, no magic, 0 intersecting frames, most stretch 21%.
- classic3, --area 0.035 --iters 5: 9 crossings, 1299 frames, 325 s, no second tries, no magic, 0 intersecting frames, most stretch 14%.
- circle.svg ("Uret", 5x5, ring of shared arcs, thin curved bands): 25 crossings, 3980 frames, 1566 s; 8 draws tried again by pulling
  (4 of them then came out), 8 strips passed through by magic, a ghost present in 3111 frames, most stretch 64%. Watchable but
  not clean: the first red rows are a mess.
- nemt-hjerte.svg (3x3, a heart in the middle), --area 0.04: 9 crossings, 1466 frames, 425 s, no second tries, no magic, 0 intersecting frames.
  (All four with --curl 0.4, the default.)

## Not done
1. Uret still needs magic (see above). The strips that give trouble are the two disc strips and the thin arcs next to them.
2. Speed (user would like <= 1 minute per design): 15-25 minutes for 16-25 crossings on 2 cores. Ideas not tried: coarser
   mesh away from the cuts, fewer frames per stage with the viewer interpolating, skipping the whole-mesh check
   (--nocheck), one process per core across designs (run_all.sh does this).
3. Other designs: `--dry` over the 96 SVGs (SURVEY.tsv): 72 start cleanly; 16 have a finished weave that already intersects
   (levels from triangle votes go wrong; look at one with `--force --stop 1` and view.py); 8 are not read into the right
   number of strips (cuts that touch or cross, loose pieces). Only four designs have been simulated end to end.
4. cutmesh.load_cuts: sub-paths are separate pieces, pieces meeting end to end are joined into one cut, and a design that
   draws only one half's cuts gets the mirror image for the other (same lines in each half's own coordinates).
