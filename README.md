# Post-Jam Refactor

After the 7drl jam I realized the DX was very poor, too clunky and verbose to add new content and calculate whether or not positions were correct, lever/door placement, etc.

A simpler approach should be possible.

## New Approach

The rot.js callback system does seem to be the best compromise for placing content.

The new plan will be to run the bsp generation step (pretty much left as-is, that worked very well), but when it's time to generate content we go through cell-by-cell on all walls and floors and call the callback function for each one.

Cell mask data will be passed in to the callback args param.

## API Utilities

Functions available to the developer for interacting with the BSP graph.

### BSP Mask DataTexture Interfaces

Functions should be provided for getting/setting values on each mask with native typescript typing to return values that are relevant to the developer for use in the callback.

Example: `getMaskSolid(x, y)` would return a value of "wall" or "floor", but you could also extend the interface that function returns to include another state value like "bars" which could be used elsewhere.

### BSP Gamelogic Functions

We'll need callbacks for determining whether or not a cell is in or out of LOS, walkable (A*), etc.  This way if the developer does something like add another possible state to a DataTexture mask we can make a decision based on that inside the cell's callback.
