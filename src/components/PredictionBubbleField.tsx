"use client";

import React from "react";
import PredictionBubbleCanvas from "./PredictionBubbleCanvas";
import { PredictionNodeData } from "./PredictionTypes";

type Props = {
  markets: PredictionNodeData[];
  onBubbleClick?: (market: PredictionNodeData) => void;
};

const PanelWrapper: React.FC<Props> = ({ markets, onBubbleClick }) => {
  return (
    <div className="absolute inset-0" style={{ position: 'absolute' }}>
      <PredictionBubbleCanvas items={markets || []} onBubbleClick={onBubbleClick} />
    </div>
  );
};

export const PredictionBubbleField = React.memo(PanelWrapper);
