import { PredictionNodeData } from './PredictionTypes';

type Props = {
    node: any; // PredictionNodeData augmented with r,x,y
    onClick?: (n: PredictionNodeData) => void;
};

export default function PredictionBubbleNode({ node, onClick }: Props) {
    const r = node.r ?? 24;
    const label = node.agentEmoji ? String(node.agentEmoji) : (node.symbol ?? node.question ?? String(node.id ?? '?')).toString().slice(0, 6);
    const change = typeof node.change === 'number' ? node.change : (node.change ? Number(node.change) : 0);
    const pct = (isNaN(change) ? 0 : change).toFixed(2);
    const cls = (change ?? 0) >= 0 ? 'bubble positive' : 'bubble negative';

    const id = node.id || node.question || JSON.stringify(node);

    return (
        <g data-id={id} className="pred-node" transform={`translate(${node.x},${node.y})`} onClick={(e) => { e.stopPropagation(); onClick?.(node); }}>
            <circle className={cls} r={r} />
            <text className="symbol" dy="-0.35em">{label}</text>
            <text className="pct" dy="0.45em">{(change >= 0 ? '+' : '') + pct + '%'}</text>
        </g>
    );
}
