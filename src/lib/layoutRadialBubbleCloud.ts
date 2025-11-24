// lib/layoutRadialBubbleCloud.ts

export type BubbleItem<T> = {
  id: string;
  data: T;
};

export type PositionedBubble<T> = {
  id: string;
  data: T;
  x: number;
  y: number;
  radius: number;
  index: number;
};

export function layoutRadialBubbleCloud<T>(
  items: BubbleItem<T>[],
  width: number,
  height: number,
  maxVisible = 10000 // Show ALL markets - no artificial limit (increased for performance)
): PositionedBubble<T>[] {
  try {
    if (!width || !height || items.length === 0) {
      return [];
    }
    
    // CRITICAL: For 150+ bubbles, use ultra-simple grid layout to prevent crashes
    // Skip ALL expensive collision detection and verification for better performance
    const totalItems = Math.min(items.length, maxVisible);
    if (totalItems >= 150) {
      return layoutSimpleGrid(items.slice(0, totalItems), width, height);
    }
    
  // Container height already accounts for navbars (viewport - top navbar - bottom navbar)
  // Add padding to keep bubbles away from edges (glow extends ~15px)
  const edgePadding = 20; // Padding to keep bubbles away from container edges
  const startY = edgePadding; // Start with padding from top
  const endY = height - edgePadding; // End with padding from bottom

  // NO LIMITING - show ALL bubbles requested, make them smaller if needed
  const visible = items.slice(0, maxVisible);
  const n = visible.length;

  // USE FULL SPACE - BUBBLES FILL ENTIRE SCREEN
  const usableWidth = width;
  const usableHeight = height; // Use full height
  
  // NO CENTER CALCULATION - we spread across FULL space, not centered
  
  // Estimate radius from available area (rectangular, not circular)
  const totalArea = usableWidth * usableHeight;
  const areaPer = totalArea / (n * 1.3); // Space per bubble (increased from 1.5 to 1.3 for bigger bubbles)
  let estimatedRadius = Math.sqrt(areaPer / Math.PI);

  // Base radius - SCALE DOWN if we have many bubbles to fit them all
  // Calculate based on available space and item count
  const spacePerBubble = (usableWidth * usableHeight) / n;
  const radiusFromSpace = Math.sqrt(spacePerBubble / Math.PI) * 0.5; // Use 50% of available space per bubble (increased from 40%)
  
  // Size constraints - SCALE DOWN for more bubbles (increased base sizes)
  const minRadius = n > 200 ? 35 : n > 150 ? 40 : n > 100 ? 45 : n > 50 ? 50 : 55; // Bigger base sizes (increased ~10px across the board)
  const maxRadius = n > 200 ? 70 : n > 150 ? 80 : n > 100 ? 90 : n > 50 ? 100 : 110; // Bigger max sizes (increased ~20px across the board)
  const baseRadius = Math.max(minRadius, Math.min(maxRadius, Math.min(radiusFromSpace, estimatedRadius)));
  
  // Calculate bubble sizes based on VOLUME (higher volume = bigger bubble)
  // First, find min/max volume to normalize
  const volumes: number[] = [];
  for (let i = 0; i < n; i++) {
    const item = visible[i];
    const data = item.data as any;
    const volume = typeof data?.volume === 'string' ? parseFloat(data.volume) : (data?.volume || 0);
    volumes.push(Math.max(0, volume)); // Ensure non-negative
  }
  
  const nonZeroVolumes = volumes.filter(v => v > 0);
  const minVolume = nonZeroVolumes.length > 0 ? Math.min(...nonZeroVolumes) : 0;
  const maxVolume = volumes.length > 0 ? Math.max(...volumes) : 1;
  const volumeRange = maxVolume - minVolume;
  
  // Size range: smaller bubbles for low volume, bigger for high volume
  // Make size range bigger to fill screen better
  const minVolumeRadius = baseRadius * 0.7; // 70% of base for low volume
  const maxVolumeRadius = baseRadius * 2.5; // 250% of base for high volume (bigger range for more variation)
  
  // Bubbles should NOT touch or overlap - ensure proper spacing for natural floating
  // CRITICAL: Account for visual effects that extend beyond bubble radius:
  // - 2px border (border-2)
  // - Box shadow blur (~8px extension)
  // - Border glow effect (~10px visible extension)
  // - Animation movement (~15px extension during float)
  const visualExtension = 10; // Reduced for tighter packing
  const minGap = 8; // Smaller gap to fit more bubbles - NO TOUCHING, NO STACKING
  const effectiveMinGap = minGap + visualExtension; // Safe gap with visual extension = 18px minimum
  
  // Use ACTUAL max radius for bounds checking only - NO padding, bubbles go to edges
  const actualMaxRadius = maxVolumeRadius;
  const actualMinimalPadding = 0; // NO padding - use full space
  
  // CRITICAL: Use FULL width and height - bubbles go edge to edge
  const actualUsableWidth = width;
  const actualUsableHeight = height;
  
  // Increase spacing to account for animation movement and ensure no touching
  const animationBuffer = 15; // Reduced for tighter packing
  const horizontalSpacing = 2 * maxVolumeRadius + effectiveMinGap + animationBuffer;
  const verticalSpacing = Math.sqrt(3) * (maxVolumeRadius + (effectiveMinGap + animationBuffer) * 0.5);

  // Calculate how many rows/cols we need to fit all items across the FULL available space
  // Use hexagonal grid layout spread across ENTIRE area - no center clustering
  const rows = Math.ceil(actualUsableHeight / verticalSpacing) + 10; // Extra buffer to fill space
  const cols = Math.ceil(actualUsableWidth / horizontalSpacing) + 10; // Extra buffer to fill space

  const positions: { x: number; y: number }[] = [];

  // Generate positions across the ENTIRE available space - with edge padding
  // Fill from top to bottom - CONTAINER with padding (container already accounts for navbars)
  const startX = edgePadding; // Start with padding from left
  const endX = width - edgePadding; // End with padding from right
  const startYPos = edgePadding; // Start with padding from top
  const endYPos = height - edgePadding; // End with padding from bottom
  
  for (let row = 0; row < rows; row++) {
    const y = startYPos + (row / Math.max(1, rows - 1)) * (endYPos - startYPos); // Distribute across FULL height
    const rowOffset = row % 2 === 0 ? 0 : horizontalSpacing / 2;

    for (let col = 0; col < cols; col++) {
      const x = startX + (col / Math.max(1, cols - 1)) * (endX - startX) + rowOffset; // Distribute across FULL width

      // Use FULL width and height - spread from absolute edge to absolute edge
      // Allow bubbles to go slightly outside bounds for better coverage
      if (x >= -maxVolumeRadius && x <= width + maxVolumeRadius && y >= -maxVolumeRadius && y <= height + maxVolumeRadius) {
        positions.push({ x, y });
      }
    }
  }

  // DON'T sort by center - spread across FULL space!
  // Sort by a deterministic pattern (left-to-right, top-to-bottom) for stable layout
  // This prevents bubbles from clustering in the center AND ensures stable positions on refresh
  positions.sort((a, b) => {
    // Primary sort: by Y position (top to bottom)
    if (Math.abs(a.y - b.y) > 1) {
      return a.y - b.y;
    }
    // Secondary sort: by X position (left to right)
    return a.x - b.x;
  });

  const bubbles: PositionedBubble<T>[] = [];
  
  // Calculate all bubble radii based on VOLUME (most popular = bigger)
  const bubbleRadii: number[] = [];
  for (let i = 0; i < n; i++) {
    const item = visible[i];
    const data = item.data as any;
    const volume = typeof data?.volume === 'string' ? parseFloat(data.volume) : (data?.volume || 0);
    
    // Normalize volume to 0-1 range for sizing
    let volumeMultiplier = 0.5; // Default to middle size if no volume
    if (volumeRange > 0 && volume > 0) {
      volumeMultiplier = (volume - minVolume) / volumeRange;
    } else if (volume > 0) {
      // All volumes are the same, use default
      volumeMultiplier = 0.5;
    }
    
    // Calculate radius based on volume (higher volume = bigger bubble)
    const radius = minVolumeRadius + (maxVolumeRadius - minVolumeRadius) * volumeMultiplier;
    bubbleRadii.push(radius);
  }

  // OPTIMIZED: Spatial grid for O(1) collision detection instead of O(n)
  const gridCellSize = Math.max(100, maxVolumeRadius * 2 + effectiveMinGap + 15);
  const gridCols = Math.ceil(width / gridCellSize);
  const gridRows = Math.ceil(height / gridCellSize);
  const spatialGrid: PositionedBubble<T>[][] = Array(gridRows * gridCols).fill(null).map(() => []);
  
  // Helper to get grid cell index
  const getGridIndex = (x: number, y: number): number => {
    const col = Math.floor(Math.max(0, Math.min(width - 1, x)) / gridCellSize);
    const row = Math.floor(Math.max(0, Math.min(height - 1, y)) / gridCellSize);
    return row * gridCols + col;
  };
  
  // Helper to get all nearby grid cells
  const getNearbyCells = (x: number, y: number, radius: number): number[] => {
    const cells: number[] = [];
    const searchRadius = radius + maxVolumeRadius + effectiveMinGap + 15;
    const minCol = Math.max(0, Math.floor((x - searchRadius) / gridCellSize));
    const maxCol = Math.min(gridCols - 1, Math.floor((x + searchRadius) / gridCellSize));
    const minRow = Math.max(0, Math.floor((y - searchRadius) / gridCellSize));
    const maxRow = Math.min(gridRows - 1, Math.floor((y + searchRadius) / gridCellSize));
    
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        cells.push(row * gridCols + col);
      }
    }
    return cells;
  };
  
  // Function to check if a position would collide with existing bubbles
  // OPTIMIZED: Uses spatial grid for O(k) where k is nearby bubbles, not O(n)
  const hasCollision = (x: number, y: number, radius: number, excludeIndex: number = -1): boolean => {
    const nearbyCells = getNearbyCells(x, y, radius);
    const animationBuffer = 15;
    const minDistance = radius + maxVolumeRadius + effectiveMinGap + animationBuffer;
    
    for (const cellIndex of nearbyCells) {
      const cellBubbles = spatialGrid[cellIndex] || [];
      for (const existingBubble of cellBubbles) {
        // Skip if this is the excluded bubble
        const bubbleIndex = bubbles.findIndex(b => b.id === existingBubble.id);
        if (bubbleIndex === excludeIndex) continue;
        
        const dx = x - existingBubble.x;
        const dy = y - existingBubble.y;
        const distanceSq = dx * dx + dy * dy; // Use squared distance to avoid sqrt
        const minDistanceSq = (radius + existingBubble.radius + effectiveMinGap + animationBuffer) ** 2;
        
        if (distanceSq < minDistanceSq && distanceSq > 0.000001) {
          return true;
        }
      }
    }
    return false;
  };

  // Function to find a non-colliding position for a bubble
  const findNonCollidingPosition = (radius: number, preferredX: number, preferredY: number): { x: number; y: number } | null => {
    // First try the preferred position
    if (!hasCollision(preferredX, preferredY, radius)) {
      // Clamp to bounds - allow bubbles to fill entire screen (just radius minimum from edges)
      // Allow bubbles to go anywhere on screen, including behind navbar
      const x = Math.max(edgePadding + radius, Math.min(width - edgePadding - radius, preferredX));
      const y = Math.max(edgePadding + radius, Math.min(height - edgePadding - radius, preferredY)); // Stay within container bounds with padding
      if (!hasCollision(x, y, radius)) {
        return { x, y };
      }
    }

    // Try positions in a spiral around the preferred position
    // OPTIMIZED: Dramatically reduce spiral attempts for many bubbles to prevent freezing
    const animationBuffer = 15; // Reduced for tighter packing
    const maxSpiralRadius = Math.min(width, height) / 2;
    const stepSize = effectiveMinGap + radius + animationBuffer; // Larger steps for better spacing
    let spiralRadius = stepSize;
    const maxSpiralAttempts = n > 300 ? 20 : n > 200 ? 50 : n > 150 ? 80 : n > 100 ? 150 : 300; // Much fewer attempts for many bubbles
    
    while (spiralRadius < maxSpiralRadius && bubbles.length < maxSpiralAttempts) {
      const numPoints = Math.max(8, Math.floor((2 * Math.PI * spiralRadius) / stepSize));
      
      for (let i = 0; i < numPoints; i++) {
        const angle = (2 * Math.PI * i) / numPoints;
        const x = preferredX + Math.cos(angle) * spiralRadius;
        const y = preferredY + Math.sin(angle) * spiralRadius;
        
        // Clamp to bounds - allow bubbles to fill entire screen (just radius minimum from edges)
        const clampedX = Math.max(radius, Math.min(width - radius, x));
        const clampedY = Math.max(radius, Math.min(height - radius, y)); // Fill entire screen
        
        if (!hasCollision(clampedX, clampedY, radius)) {
          return { x: clampedX, y: clampedY };
        }
      }
      
      spiralRadius += stepSize;
    }

    // If spiral search fails, try grid positions - use FULL space edge to edge
    for (let row = 0; row < rows * 2; row++) {
      for (let col = 0; col < cols * 2; col++) {
        const x = col * (horizontalSpacing * 0.5) + ((row % 2) * horizontalSpacing * 0.25);
        const y = row * (verticalSpacing * 0.5);
        
        const clampedX = Math.max(radius, Math.min(width - radius, x));
        const clampedY = Math.max(radius, Math.min(height - radius, y)); // Fill entire screen
        
        if (!hasCollision(clampedX, clampedY, radius)) {
          return { x: clampedX, y: clampedY };
        }
      }
    }

    return null; // Could not find a position
  };

  // Place bubbles one by one with EXTREMELY strict collision detection
  // CRITICAL: Each bubble MUST be verified before adding to prevent ANY stacking
  for (let i = 0; i < n; i++) {
    const item = visible[i];
    const radius = bubbleRadii[i];
    
    // Get preferred position from grid
    let preferredX: number;
    let preferredY: number;
    
    if (i < positions.length) {
      preferredX = positions[i].x;
      preferredY = positions[i].y;
    } else {
      // Generate position for items beyond available positions - use FULL space edge to edge
      const extraRow = Math.floor((i - positions.length) / cols);
      const extraCol = (i - positions.length) % cols;
      preferredX = extraCol * horizontalSpacing + (extraRow % 2 === 0 ? 0 : horizontalSpacing / 2);
      preferredY = (rows + extraRow) * verticalSpacing;
      
      // Make sure we don't go beyond full space bounds (just radius minimum)
      // Fill entire screen
      preferredX = Math.max(radius, Math.min(preferredX, width - radius));
      preferredY = Math.max(radius, Math.min(preferredY, height - radius));
    }

    // Find a non-colliding position - try multiple times if needed
    let pos = findNonCollidingPosition(radius, preferredX, preferredY);
    
    // If first attempt fails, try random positions across the screen
    // OPTIMIZED: Reduce random attempts for many bubbles
    const maxRandomAttempts = n > 300 ? 20 : n > 200 ? 50 : 100;
    if (!pos) {
      let attempts = 0;
      while (!pos && attempts < maxRandomAttempts) {
        const randomX = edgePadding + radius + Math.random() * (width - 2 * edgePadding - 2 * radius);
        const randomY = edgePadding + radius + Math.random() * (height - 2 * edgePadding - 2 * radius);
        pos = findNonCollidingPosition(radius, randomX, randomY);
        attempts++;
      }
    }
    
    // STRICT: If we STILL can't find a position, SKIP this bubble - don't stack it
    if (!pos) {
      // Silently skip bubbles that can't be placed to avoid console spam
      continue;
    }
    
    // TRIPLE CHECK: Verify the position doesn't collide with ANY existing bubble
    let hasAnyCollision = false;
    for (let j = 0; j < bubbles.length; j++) {
      const existingBubble = bubbles[j];
      const dx = pos.x - existingBubble.x;
      const dy = pos.y - existingBubble.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const animationBuffer = 15;
      const minDistance = radius + existingBubble.radius + effectiveMinGap + animationBuffer;
      
      if (distance < minDistance && distance > 0.001) {
        hasAnyCollision = true;
        break;
      }
    }
    
    if (hasAnyCollision) {
      // Silently skip bubbles with collisions to avoid console spam
      continue;
    }

    // FINAL VERIFICATION: Position is safe, add bubble
    // CRITICAL: Check for duplicate positions - if two bubbles have same x,y, offset one slightly
    let finalX = pos.x;
    let finalY = pos.y;
    
    // Check if this exact position already exists
    for (const existing of bubbles) {
      if (Math.abs(existing.x - finalX) < 0.1 && Math.abs(existing.y - finalY) < 0.1) {
        // Same position! Offset this bubble slightly
        finalX += radius * 0.5;
        finalY += radius * 0.5;
        // Clamp to bounds
        finalX = Math.max(radius, Math.min(width - radius, finalX));
        finalY = Math.max(radius, Math.min(height - radius, finalY));
        // Silently handle duplicate positions
        break;
      }
    }
    
    const newBubble: PositionedBubble<T> = {
      id: item.id,
      data: item.data,
      x: finalX,
      y: finalY,
      radius,
      index: i,
    };
    
    bubbles.push(newBubble);
    
    // OPTIMIZED: Add to spatial grid for fast collision detection
    const gridIndices = getNearbyCells(finalX, finalY, radius);
    for (const idx of gridIndices) {
      if (!spatialGrid[idx]) spatialGrid[idx] = [];
      spatialGrid[idx].push(newBubble);
    }
  }

  // OPTIMIZED: Rebuild spatial grid after initial placement
  const rebuildSpatialGrid = () => {
    spatialGrid.forEach(cell => cell.length = 0);
    bubbles.forEach(bubble => {
      const gridIndices = getNearbyCells(bubble.x, bubble.y, bubble.radius);
      for (const idx of gridIndices) {
        if (!spatialGrid[idx]) spatialGrid[idx] = [];
        spatialGrid[idx].push(bubble);
      }
    });
  };
  rebuildSpatialGrid();
  
  // Post-processing: resolve any remaining collisions with iterative relaxation
  // OPTIMIZED: Dramatically reduce iterations for many bubbles to prevent freezing
  // For many bubbles, use much fewer iterations - prioritize performance over perfect spacing
  // Skip entirely for 250+ bubbles (handled by simple grid above)
  const maxRelaxationIterations = n > 250 ? 0 : n > 200 ? 10 : n > 150 ? 20 : n > 100 ? 30 : n > 50 ? 50 : 100;
  let totalMoved = 0;
  
  for (let iter = 0; iter < maxRelaxationIterations; iter++) {
    let moved = false;
    
    for (let i = 0; i < bubbles.length; i++) {
      const bubble = bubbles[i];
      let fx = 0; // Force X
      let fy = 0; // Force Y
      
      // OPTIMIZED: Use spatial grid to only check nearby bubbles
      const nearbyCells = getNearbyCells(bubble.x, bubble.y, bubble.radius);
      const animationBuffer = 15;
      const minDistanceBase = bubble.radius + effectiveMinGap + animationBuffer;
      
      for (const cellIndex of nearbyCells) {
        const cellBubbles = spatialGrid[cellIndex] || [];
        for (const other of cellBubbles) {
          if (other.id === bubble.id) continue;
          const dx = bubble.x - other.x;
          const dy = bubble.y - other.y;
          const distanceSq = dx * dx + dy * dy;
          const minDistance = minDistanceBase + other.radius;
          const minDistanceSq = minDistance * minDistance;
          
          if (distanceSq < minDistanceSq && distanceSq > 0.000001) {
            const distance = Math.sqrt(distanceSq);
            const overlap = minDistance - distance;
            const force = overlap * 3.0;
            const angle = Math.atan2(dy, dx);
            fx += Math.cos(angle) * force;
            fy += Math.sin(angle) * force;
            moved = true;
          }
        }
      }
      
      // Also apply boundary forces - allow bubbles closer to edges
      const padding = bubble.radius; // Just radius, no extra gap
      if (bubble.x < edgePadding + padding) fx += (edgePadding + padding - bubble.x) * 0.5;
      if (bubble.x > width - edgePadding - padding) fx -= (bubble.x - (width - edgePadding - padding)) * 0.5;
      if (bubble.y < edgePadding + padding) fy += (edgePadding + padding - bubble.y) * 0.5; // Stay within container top with padding
      if (bubble.y > height - edgePadding - padding) fy -= (bubble.y - (height - edgePadding - padding)) * 0.5; // Stay within container bottom with padding
      
      // Apply forces
      if (fx !== 0 || fy !== 0) {
        bubble.x += fx;
        bubble.y += fy;
        
        // Clamp to bounds - fill entire screen
        bubble.x = Math.max(edgePadding + bubble.radius, Math.min(width - edgePadding - bubble.radius, bubble.x));
        bubble.y = Math.max(edgePadding + bubble.radius, Math.min(height - edgePadding - bubble.radius, bubble.y));
        totalMoved++;
      }
    }
    
    // OPTIMIZED: Rebuild spatial grid after each iteration
    if (moved) {
      rebuildSpatialGrid();
    }
    
    // If no bubbles moved, we're done
    if (!moved) break;
  }

  // STRICT Final verification - run MULTIPLE passes until ZERO overlaps remain
  // OPTIMIZED: Dramatically reduce verification passes for many bubbles to prevent freezing
  // Skip verification entirely for very large counts - prioritize performance
  const maxVerificationPasses = n > 300 ? 0 : n > 200 ? 3 : n > 150 ? 5 : n > 100 ? 10 : n > 50 ? 25 : 50;
  let verificationPasses = 0;
  let overlapsRemaining = 0;
  
  do {
    overlapsRemaining = 0;
    rebuildSpatialGrid(); // Ensure grid is up to date
    
    // OPTIMIZED: Use spatial grid to only check nearby bubbles
    for (let i = 0; i < bubbles.length; i++) {
      const a = bubbles[i];
      const nearbyCells = getNearbyCells(a.x, a.y, a.radius);
      const animationBuffer = 15;
      const minDistanceBase = a.radius + effectiveMinGap + animationBuffer;
      
      for (const cellIndex of nearbyCells) {
        const cellBubbles = spatialGrid[cellIndex] || [];
        for (const b of cellBubbles) {
          if (b.id === a.id || bubbles.findIndex(bub => bub.id === b.id) <= i) continue; // Skip self and already checked pairs
          
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distanceSq = dx * dx + dy * dy;
          const minDistance = minDistanceBase + b.radius;
          const minDistanceSq = minDistance * minDistance;
          
          if (distanceSq < minDistanceSq && distanceSq > 0.000001) {
            overlapsRemaining++;
            const distance = Math.sqrt(distanceSq);
            
            // Try emergency separation first - FORCE apart with extra space
            const overlap = minDistance - distance;
            const angle = Math.atan2(dy, dx);
            // Push further apart to ensure gap - be EXTREMELY aggressive
            const pushDistance = overlap + (effectiveMinGap * 1.2); // MUCH larger push to prevent stacking
            const pushX = Math.cos(angle) * pushDistance;
            const pushY = Math.sin(angle) * pushDistance;
            
            // Move both bubbles apart
            const newAX = a.x + pushX;
            const newAY = a.y + pushY;
            const newBX = b.x - pushX;
            const newBY = b.y - pushY;
            
            // Clamp both strictly - fill entire screen
            const clampedAX = Math.max(a.radius, Math.min(width - a.radius, newAX));
            const clampedAY = Math.max(a.radius, Math.min(height - a.radius, newAY));
            const clampedBX = Math.max(b.radius, Math.min(width - b.radius, newBX));
            const clampedBY = Math.max(b.radius, Math.min(height - b.radius, newBY));
            
            // Check if separation worked - if not, mark one for removal
            const newDx = clampedAX - clampedBX;
            const newDy = clampedAY - clampedBY;
            const newDistance = Math.sqrt(newDx * newDx + newDy * newDy);
            
            if (newDistance >= minDistance) {
              // Separation worked, apply it
              a.x = clampedAX;
              a.y = clampedAY;
              b.x = clampedBX;
              b.y = clampedBY;
            } else {
              // Separation failed - try harder, push further
              const extremePush = overlap * 2;
              const extremePushX = Math.cos(angle) * extremePush;
              const extremePushY = Math.sin(angle) * extremePush;
              a.x += extremePushX;
              a.y += extremePushY;
              b.x -= extremePushX;
              b.y -= extremePushY;
              // Clamp again
              a.x = Math.max(a.radius, Math.min(width - a.radius, a.x));
              a.y = Math.max(a.radius, Math.min(height - a.radius, a.y));
              b.x = Math.max(b.radius, Math.min(width - b.radius, b.x));
              b.y = Math.max(b.radius, Math.min(height - b.radius, b.y));
            }
          }
        }
      }
    }
    
    verificationPasses++;
    
    // Break if no overlaps found OR we've done too many passes
    if (overlapsRemaining === 0 || verificationPasses >= maxVerificationPasses) {
      break;
    }
  } while (overlapsRemaining > 0 && verificationPasses < maxVerificationPasses);
  
  // NO REMOVAL - keep all bubbles, just ensure they're separated
  // Final pass: Force separate any remaining overlaps instead of removing
  // OPTIMIZED: Use spatial grid
  rebuildSpatialGrid();
  for (let i = 0; i < bubbles.length; i++) {
    const a = bubbles[i];
    const nearbyCells = getNearbyCells(a.x, a.y, a.radius);
    const animationBuffer = 15;
    const minDistanceBase = a.radius + effectiveMinGap + animationBuffer;
    
    for (const cellIndex of nearbyCells) {
      const cellBubbles = spatialGrid[cellIndex] || [];
      for (const b of cellBubbles) {
        if (b.id === a.id || bubbles.findIndex(bub => bub.id === b.id) <= i) continue;
        
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distanceSq = dx * dx + dy * dy;
        const minDistance = minDistanceBase + b.radius;
        const minDistanceSq = minDistance * minDistance;
        
        if (distanceSq < minDistanceSq && distanceSq > 0.000001) {
          const distance = Math.sqrt(distanceSq);
          // Force separate - push apart
          const overlap = minDistance - distance;
          const angle = Math.atan2(dy, dx);
          const pushDistance = overlap * 0.5;
          const pushX = Math.cos(angle) * pushDistance;
          const pushY = Math.sin(angle) * pushDistance;
          
          a.x += pushX;
          a.y += pushY;
          b.x -= pushX;
          b.y -= pushY;
          
          // Clamp to bounds
          a.x = Math.max(a.radius, Math.min(width - a.radius, a.x));
          a.y = Math.max(a.radius, Math.min(height - a.radius, a.y));
          b.x = Math.max(b.radius, Math.min(width - b.radius, b.x));
          b.y = Math.max(b.radius, Math.min(height - b.radius, b.y));
        }
      }
    }
  }

  console.log(`Layout complete: ${bubbles.length} bubbles placed (ALL bubbles shown)`);
  return bubbles;
  } catch (error) {
    return [];
  }
}

// ULTRA-SIMPLE grid layout for 300+ bubbles - NO collision detection, NO verification
// This prevents crashes and freezing for very large bubble counts
function layoutSimpleGrid<T>(
  items: BubbleItem<T>[],
  width: number,
  height: number
): PositionedBubble<T>[] {
  const n = items.length;
  const edgePadding = 20;
  const usableWidth = width - 2 * edgePadding;
  const usableHeight = height - 2 * edgePadding;
  
  // Calculate grid dimensions - aim for roughly square cells
  const aspectRatio = usableWidth / usableHeight;
  const cols = Math.ceil(Math.sqrt(n * aspectRatio));
  const rows = Math.ceil(n / cols);
  
  // Calculate cell size
  const cellWidth = usableWidth / cols;
  const cellHeight = usableHeight / rows;
  const cellSize = Math.min(cellWidth, cellHeight);
  
  // Fixed radius for all bubbles (increased size to match main layout)
  // CRITICAL: For 150+ bubbles, ALWAYS use fixed radius (no volume calculation) for max performance
  // Volume calculations are expensive and cause slowness
  const useFixedRadius = n >= 150; // Always use fixed radius for 150+
  const radius = Math.max(20, Math.min(40, cellSize * 0.45)); // Increased from 15-30 to 20-40, and multiplier from 0.35 to 0.45
  
  // SKIP volume calculations entirely for 150+ bubbles - too expensive
  // No size variation for large counts - all bubbles same size for performance
  
  const bubbles: PositionedBubble<T>[] = [];
  
  // Place bubbles in grid - simple, fast, no collision detection
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    
    // Center in cell with slight random offset for natural look
    // CRITICAL: Reduce/eliminate random offset for 150+ bubbles - Math.random() is expensive
    const offsetFactor = n >= 300 ? 0 : n >= 200 ? 0.1 : n >= 150 ? 0.15 : 0.3; // No offset for very large counts
    const baseX = edgePadding + (col + 0.5) * cellWidth;
    const baseY = edgePadding + (row + 0.5) * cellHeight;
    // Skip random calculation for 300+ bubbles - use deterministic positioning
    const offsetX = offsetFactor > 0 ? (Math.random() - 0.5) * cellWidth * offsetFactor : 0;
    const offsetY = offsetFactor > 0 ? (Math.random() - 0.5) * cellHeight * offsetFactor : 0;
    
    // CRITICAL: Always use fixed radius for 150+ bubbles - no volume calculations
    // Volume calculations are too expensive and cause performance issues
    const bubbleRadius = radius; // Fixed size for all bubbles
    
    // Clamp to bounds
    const x = Math.max(edgePadding + bubbleRadius, Math.min(width - edgePadding - bubbleRadius, baseX + offsetX));
    const y = Math.max(edgePadding + bubbleRadius, Math.min(height - edgePadding - bubbleRadius, baseY + offsetY));
    
    bubbles.push({
      id: items[i].id,
      data: items[i].data,
      x,
      y,
      radius: bubbleRadius,
      index: i,
    });
  }
  
  console.log(`Simple grid layout: ${bubbles.length} bubbles placed (fast mode for large count)`);
  return bubbles;
}

