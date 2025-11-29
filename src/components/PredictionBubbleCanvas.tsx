"use client";

import { listenToAgentPredictions, listenToMarkets } from '@/lib/firebase/listeners';
import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { PredictionNodeData } from "./PredictionTypes";

type Props = {
    items?: PredictionNodeData[];
    showTitle?: boolean;
    onBubbleClick?: (item: PredictionNodeData) => void;
    viewMode?: 'predictions' | 'markets';
    searchQuery?: string;
};

// D3-powered bubble map. Mirrors the standalone HTML example: strong center pull,
// collision avoidance, drag with snap-back and responsive resizing. Calls
// `onBubbleClick` when a bubble is clicked.
export default function PredictionBubbleCanvas({ items, onBubbleClick, showTitle, viewMode = 'predictions', searchQuery = '' }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    // Track transform for pan/zoom applied to the content group
    const transformRef = useRef<{ scale: number; tx: number; ty: number }>({ scale: 1, tx: 0, ty: 0 });
    // If user interacts (pan/zoom), disable automatic fit-to-bounds
    const autoZoomRef = useRef<boolean>(true);
    // small ref to avoid re-creating handlers
    const panStartRef = useRef<{ x: number; y: number } | null>(null);

    // Maintain a stable nodes map so seeded positions persist across renders
    const nodesRef = useRef<Record<string, any>>({});
    const simRef = useRef<d3.Simulation<any, undefined> | null>(null);
    // Simple refs
    // (no external compute ref in production)

    const [fetchedItems, setFetchedItems] = useState<any[] | null>(null);
    const [marketsMapState, setMarketsMapState] = useState<Record<string, any>>({});
    const marketsRef = useRef<Record<string, any>>({});
    const [decisionFilter, setDecisionFilter] = useState<'all' | 'yes' | 'no'>('all');

    // Listen for external filter events (so header controls can live outside this component)
    useEffect(() => {
        const handler = (e: any) => {
            try {
                const val = e?.detail;
                if (val === 'yes' || val === 'no' || val === 'all') setDecisionFilter(val);
            } catch (err) { }
        };
        window.addEventListener('mira-decision-filter', handler as EventListener);
        return () => window.removeEventListener('mira-decision-filter', handler as EventListener);
    }, [items]);
    // Helper that looks up market entries either directly or under a 'markets' child
    const getMarketEntry = (k: any) => {
        try {
            if (!k && k !== 0) return null;
            const key = String(k);
            const direct = marketsRef.current && (marketsRef.current[key] || marketsRef.current[Number(key)]);
            if (direct) return direct;
            const nested = marketsRef.current && marketsRef.current.markets && (marketsRef.current.markets[key] || marketsRef.current.markets[Number(key)]);
            if (nested) return nested;
            return null;
        } catch (e) { return null; }
    };
    // Dark overlay opacity applied on top of images inside bubbles. Lower value
    // makes images brighter/less obscured behind the frosted overlay.
    const IMAGE_OVERLAY_OPACITY = 0.22; // reduced from 0.45 for clearer visuals

    // Normalize confidence/probability values to 0-100 integers like AISummaryPanel.parseConfidence
    const normalizeConfidence = (c: any) => {
        const num = (typeof c === 'number') ? c : (c ? Number(c) : 0);
        if (isNaN(num)) return 0;
        if (Math.abs(num) <= 1) return Math.round(num * 100);
        return Math.round(num);
    };
    // Subscribe to Firebase `predictions` only when in 'predictions' view and
    // when a parent didn't provide an explicit `items` prop. If a parent
    // supplies `items` we always prefer it (e.g. landing page demo data).
    useEffect(() => {
        // If a parent provided an `items` prop (even an empty array), prefer it
        // and skip the realtime subscription. This ensures search that yields
        // zero results doesn't fall back to showing the live RTDB set.
        if (Array.isArray(items)) {
            try {
                // Map incoming prop items to the internal node shape (lightweight mapping)
                const mapped = (items || []).map((p: any) => {
                    const imageUrl = p.image_url || p.imageUrl || p.market_image || p.market_image_url || p.marketImage || p.image || p.thumb || p.logo || null;
                    const rawMarketTitle = p.marketQuestion || p.market_question || p.title || p.question || p.market || '';
                    const decision = p.decision || p.side || p.position || (typeof p.probability === 'number' ? (p.probability >= 50 ? 'YES' : 'NO') : null);
                    const prob = normalizeConfidence(p.probability ?? p.confidence ?? p.price ?? null);
                    const amount = (p.bet_amount != null) ? p.bet_amount : (p.betAmount != null ? p.betAmount : (p.investmentUsd || p.investment || p.amount || p.invested || p.volume || 0));
                    return {
                        id: p.id || p.predictionId || p._id || JSON.stringify(p),
                        market: rawMarketTitle,
                        imageUrl,
                        volume: Number(p.volume || 0),
                        marketId: p.marketId || p.market_id || p.market || null,
                        probability: prob,
                        decision,
                        investmentUsd: amount,
                        agentId: p.agentId || p.agent || null,
                        agentName: p.agentName || p.agent || null,
                        raw: p,
                        change: p.change ?? 0,
                    };
                });
                mapped.sort((a: any, b: any) => {
                    const ta = a.raw?.createdAt ? new Date(a.raw.createdAt).getTime() : 0;
                    const tb = b.raw?.createdAt ? new Date(b.raw.createdAt).getTime() : 0;
                    return tb - ta;
                });
                setFetchedItems(mapped.slice(0, 100) as any[]);
            } catch (err) {
                setFetchedItems([]);
            }
            return;
        }
        // Only subscribe to agent predictions when the caller wants the
        // predictions view. If the viewMode is 'markets' we intentionally skip
        // subscribing here — markets will be rendered from the markets map.
        if (viewMode !== 'predictions') {
            return;
        }

        let unsub: (() => void) | null = null;
        try {
            unsub = listenToAgentPredictions((items) => {
                try {
                    if (!Array.isArray(items)) {
                        setFetchedItems([]);
                        return;
                    }

                    // Filter to predictions that originate from agents (have agent or agentName)
                    const agentPreds = items.filter((p: any) => p && (p.agent || p.agentName || p.agentId));

                    // Map to the node shape used by the canvas
                    const mapped = agentPreds.map((p: any) => {
                        // Prefer image fields written to the agent prediction path first
                        let imageUrl = p.image_url || p.imageUrl || p.market_image || p.market_image_url || p.marketImage || p.image || p.thumb || p.logo || null;
                        // If prediction doesn't include image, attempt to resolve from markets map via marketId/market
                        try {
                            const marketKeyCandidates = [p.marketId, p.market, p.marketSlug, p.market_id, p.conditionId].filter(Boolean);
                            if (!imageUrl && marketKeyCandidates.length) {
                                for (const mk of marketKeyCandidates) {
                                    const mEntry = getMarketEntry(mk);
                                    if (mEntry) {
                                        imageUrl = imageUrl || (mEntry.image || mEntry.imageUrl || mEntry.image_url || mEntry.thumb || mEntry.logo || null);
                                        if (imageUrl) break;
                                    }
                                }
                            }
                        } catch (e) { }
                        // Prefer agent prediction fields: marketQuestion/marketId, decision, bet_amount
                        const rawMarketTitle = p.marketQuestion || p.market_question || p.title || p.question || p.market || '';
                        const decision = p.decision || p.side || p.position || (typeof p.probability === 'number' ? (p.probability >= 50 ? 'YES' : 'NO') : null);
                        const prob = normalizeConfidence(p.probability ?? p.confidence ?? p.price ?? p.raw?.confidence ?? p.raw?.probability ?? null);
                        const amount = (p.bet_amount != null) ? p.bet_amount : (p.betAmount != null ? p.betAmount : (p.investmentUsd || p.investment || p.amount || p.invested || p.volume || 0));

                        // Helper: attempt to extract a numeric market id from various candidate fields
                        const marketKeyCandidates = [p.marketId, p.market, p.marketSlug, p.market_id, p.conditionId].filter(Boolean);
                        let resolvedMarketId: string | null = null;
                        for (const mk of marketKeyCandidates) {
                            try {
                                const s = String(mk);
                                // If candidate looks like 'markets/516706' or '516706:NAME' or contains digits, extract the first digit sequence
                                const m = s.match(/(\d{3,})/);
                                const candidateId = m ? m[1] : s;
                                if (candidateId) {
                                    // prefer exact key lookup first, then fallback to candidateId
                                    const lookupKeys = [candidateId, s];
                                    for (const k of lookupKeys) {
                                        const entry = getMarketEntry(k);
                                        if (entry) {
                                            resolvedMarketId = String(candidateId);
                                            // If market entry provides an image, use it
                                            imageUrl = imageUrl || (entry.image || entry.imageUrl || entry.image_url || entry.thumb || entry.logo || null);
                                            break;
                                        }
                                    }
                                }
                                if (resolvedMarketId) break;
                            } catch (e) { /* ignore */ }
                        }

                        // mapping result (verbose logs removed)

                        // Determine display title: prefer resolved market question from markets map when available
                        const marketFromMap = resolvedMarketId ? getMarketEntry(resolvedMarketId) : null;
                        // If agent prediction didn't include an image, attempt to pull from the market entry
                        if (!imageUrl && marketFromMap) {
                            imageUrl = marketFromMap.image || marketFromMap.imageUrl || marketFromMap.image_url || marketFromMap.thumb || marketFromMap.logo || null;
                        }
                        const marketTitle = (marketFromMap && (marketFromMap.question || marketFromMap.title)) ? (marketFromMap.question || marketFromMap.title) : rawMarketTitle;

                        return {
                            // Keep id derived from prediction id if present; marketId is the referenced market identifier
                            id: p.id || p.predictionId || p._id || JSON.stringify(p),
                            market: marketTitle,
                            imageUrl,
                            volume: Number(p.volume || 0),
                            marketId: resolvedMarketId || (p.marketId || p.market_id || p.market) || null,
                            probability: prob,
                            decision,
                            investmentUsd: amount,
                            agentId: p.agentId || p.agent || null,
                            agentName: p.agentName || p.agent || null,
                            raw: p,
                            change: p.change ?? 0,
                        };
                    });

                    // Keep a consistent ordering (newest first) and limit to top 100
                    mapped.sort((a: any, b: any) => {
                        const ta = a.raw?.createdAt ? new Date(a.raw.createdAt).getTime() : 0;
                        const tb = b.raw?.createdAt ? new Date(b.raw.createdAt).getTime() : 0;
                        return tb - ta;
                    });

                    const top = mapped.slice(0, 100);
                    // fetched agent predictions (verbose log removed)
                    setFetchedItems(top as any[]);
                } catch (err) {
                    // mapping error while processing predictions (log removed)
                    setFetchedItems([]);
                }
            });
        } catch (err) {
            // failed to subscribe to predictions (verbose log removed)
        }
        return () => { if (unsub) try { unsub(); } catch (_) { } };
    }, [items, viewMode]);

    // When the parent wants the 'markets' view, generate bubbles from the
    // canonical markets map we already listen to above. This keeps market
    // rendering separate from agent predictions and avoids subscribing to
    // agent_predictions when not needed.
    useEffect(() => {
        if (Array.isArray(items)) return; // parent-supplied items take priority
        if (viewMode !== 'markets') return;

        try {
            const mapMarketsToNodes = (map: Record<string, any> | null) => {
                try {
                    const entries = Object.entries(map || {});
                    const arr = entries.map(([k, v]: [string, any]) => {
                        const m = v || {};
                        const id = m.id || k;
                        const imageUrl = m.image || m.imageUrl || m.image_url || m.thumb || m.logo || null;
                        const slug = m.slug || m.marketSlug || m.market_slug || k;
                        const title = m.question || m.title || m.market || m.marketQuestion || '';
                        const prob = (typeof m.yes_price === 'number') ? Math.round(m.yes_price * 100) : (typeof m.probability === 'number' ? Math.round(m.probability) : 0);
                        const volume = Number(m.volume || m.total_volume || m.volume24h || m.volume_all_time || 0);
                        const change = m.change ?? 0;
                        return {
                            id: String(id),
                            // For market view, set `market` to the slug so title text shows slug
                            market: slug,
                            marketSlug: slug,
                            imageUrl,
                            volume: volume,
                            marketId: String(id),
                            probability: prob,
                            decision: undefined,
                            investmentUsd: volume,
                            agentId: null,
                            agentName: null,
                            raw: m,
                            change,
                            __isMarket: true,
                        };
                    });
                    // Sort markets by volume so most active appear first
                    arr.sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0));
                    // Apply search filter when provided by parent (case-insensitive substring match on slug/title/id)
                    try {
                        const q = (searchQuery || '').toString().trim().toLowerCase();
                        if (q) {
                            const filtered = arr.filter((it: any) => {
                                try {
                                    const slug = String(it.marketSlug || it.market || it.id || it.raw?.slug || it.raw?.title || '').toLowerCase();
                                    return slug.includes(q);
                                } catch (e) { return false; }
                            });
                            setFetchedItems((filtered || []).slice(0, 100));
                        } else {
                            setFetchedItems(arr.slice(0, 100));
                        }
                    } catch (e) {
                        setFetchedItems(arr.slice(0, 100));
                    }
                } catch (e) {
                    setFetchedItems([]);
                }
            };

            // Use the current marketsRef (may be populated by the markets listener)
            mapMarketsToNodes(marketsRef.current || marketsMapState || {});
        } catch (e) {
            setFetchedItems([]);
        }
    }, [viewMode, marketsMapState, items, searchQuery]);

    // Subscribe to markets so we can resolve image URLs for predictions that only have marketId
    useEffect(() => {
        let unsubMarkets: (() => void) | null = null;
        try {
            unsubMarkets = listenToMarkets((m) => {
                try {
                    const map = m || {};
                    marketsRef.current = map;
                    setMarketsMapState(map);
                    // markets updated (verbose log removed)
                } catch (e) {
                    // markets mapping failed (verbose log removed)
                }
            });
        } catch (e) {
            // failed to subscribe to markets (verbose log removed)
        }
        return () => { if (unsubMarkets) try { unsubMarkets(); } catch (_) { } };
    }, []);

    const nodes = useMemo(() => {
        // Apply decision filter (all / yes / no) before computing nodes
        const raw = (fetchedItems || []);
        const source = (decisionFilter === 'all') ? raw : raw.filter((d: any) => {
            try {
                const dec = getDecisionLabel(d);
                if (decisionFilter === 'yes') return dec === 'YES';
                if (decisionFilter === 'no') return dec === 'NO';
                return true;
            } catch (e) { return false; }
        });
        const width = containerRef.current ? containerRef.current.clientWidth : window.innerWidth;
        const height = containerRef.current ? containerRef.current.clientHeight : window.innerHeight;
        // Compute world-space center (convert screen center into world coords using current transform)
        const tr = transformRef.current || { scale: 1, tx: 0, ty: 0 };
        const centerX = ((width / 2) - (tr.tx || 0)) / (tr.scale || 1);
        const centerY = ((height / 2) - (tr.ty || 0)) / (tr.scale || 1);
        // Compute a dynamic radius scale that includes market volume for market view
        // so market bubbles size proportionally to observed volumes. Include multiple
        // candidate numeric fields to make the scale robust across data shapes.
        const betValues = (source || []).map((s: any) => {
            const candidates = [s.investmentUsd, s.bet_amount, s.volume, s.volume24h, s.total_volume, s.volume_all_time];
            for (const c of candidates) {
                const n = Number(c);
                if (!isNaN(n) && n > 0) return n;
            }
            return 0;
        }).filter((n: number) => !isNaN(n) && n >= 0);
        const observedMaxBet = betValues.length ? Math.max(...betValues) : 0;
        // When rendering markets (many values potentially large), allow the scale to
        // span the full observed range instead of clamping to a small fixed max.
        const isMarketView = (source || []).some((s: any) => !!s.__isMarket);
        const displayMax = Math.max(1, observedMaxBet);
        // Choose a larger output range for markets so volume differences are visually obvious
        const outputRange = isMarketView ? [18, 140] : [12, 80];
        const exponent = isMarketView ? 0.45 : 0.45;
        const radiusScale = d3.scalePow().exponent(exponent).domain([0, displayMax]).range(outputRange).clamp(true as any);

        const next: Record<string, any> = {};
        (source || []).forEach((d: any) => {
            const key = d.id || d.question || d.market || d.marketSlug || JSON.stringify(d);
            const existing = nodesRef.current[key];
            // For market-sourced nodes prefer explicit `volume` (or total_volume) as the sizing metric.
            let score: number | null = null;
            if (d && d.__isMarket) {
                score = (d.volume != null && !isNaN(Number(d.volume))) ? Number(d.volume) :
                    (d.total_volume != null && !isNaN(Number(d.total_volume))) ? Number(d.total_volume) :
                        (d.volume24h != null && !isNaN(Number(d.volume24h))) ? Number(d.volume24h) :
                            (d.investmentUsd != null && !isNaN(Number(d.investmentUsd))) ? Number(d.investmentUsd) : null;
            } else {
                // Prefer bet amount (investmentUsd / bet_amount) as the sizing score, then fall back
                const betScore = (d.investmentUsd != null && !isNaN(Number(d.investmentUsd))) ? Number(d.investmentUsd) : (d.bet_amount != null && !isNaN(Number(d.bet_amount)) ? Number(d.bet_amount) : null);
                score = (betScore != null)
                    ? betScore
                    : (d.size != null)
                        ? Number(d.size)
                        : (d.confidence != null)
                            ? Number(d.confidence)
                            : (typeof d.probability === 'number')
                                ? d.probability
                                : (d.volume24h ? Number(d.volume24h) : 0);
            }
            const numericScore = (score != null && !isNaN(Number(score))) ? Number(score) : 0;
            const r = radiusShiftSafe(radiusScale(numericScore));
            if (existing) {
                existing.r = r;
                existing.raw = d;
                next[key] = existing;
            } else {
                // seed positions inside the container bounds (world coordinates)
                const s = tr.scale || 1;
                const tx = tr.tx || 0;
                const ty = tr.ty || 0;
                const minWorldX = (r - tx) / s;
                const maxWorldX = (width - r - tx) / s;
                const minWorldY = (r - ty) / s;
                const maxWorldY = (height - r - ty) / s;
                const seedXRaw = centerX + (Math.random() - 0.5) * 200;
                const seedYRaw = centerY + (Math.random() - 0.5) * 200;
                const seedX = Math.min(Math.max(seedXRaw, minWorldX), Math.max(minWorldX, maxWorldX));
                const seedY = Math.min(Math.max(seedYRaw, minWorldY), Math.max(minWorldY, maxWorldY));
                next[key] = { ...d, r, x: seedX, y: seedY };
            }
        });

        nodesRef.current = next;
        return Object.values(next);
    }, [fetchedItems, decisionFilter]);

    // Images are provided by Firebase markets; no external fallback fetches

    useEffect(() => {
        const container = containerRef.current;
        const svgEl = svgRef.current;
        if (!container || !svgEl) return;

        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        const centerX = width / 2;
        const centerY = height / 2;

        const svg = d3.select(svgEl)
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr('overflow', 'visible');

        // Ensure filters for inner glow exist on the SVG defs
        const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
        if (defs.select('#innerGlowGreen').empty()) {
            const f = defs.append('filter')
                .attr('id', 'innerGlowGreen')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            // Reduce inner glow blur so halos are tighter and less fuzzy
            f.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 4).attr('result', 'blur');
            f.append('feComposite').attr('in', 'blur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            f.append('feFlood').attr('flood-color', '#00ff41').attr('flood-opacity', 0.9).attr('result', 'color');
            f.append('feComposite').attr('in', 'color').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredGlow');
            f.append('feBlend').attr('in', 'SourceGraphic').attr('in2', 'coloredGlow').attr('mode', 'normal');
        }
        if (defs.select('#innerGlowRed').empty()) {
            const f2 = defs.append('filter')
                .attr('id', 'innerGlowRed')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            f2.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 4).attr('result', 'blur');
            f2.append('feComposite').attr('in', 'blur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            f2.append('feFlood').attr('flood-color', '#ff0066').attr('flood-opacity', 0.9).attr('result', 'color');
            f2.append('feComposite').attr('in', 'color').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredGlow');
            f2.append('feBlend').attr('in', 'SourceGraphic').attr('in2', 'coloredGlow').attr('mode', 'normal');
        }
        // Blue (UP) and Yellow (DOWN) and Pink (OTHER) inner/outer glow filters
        if (defs.select('#innerGlowBlue').empty()) {
            const f = defs.append('filter')
                .attr('id', 'innerGlowBlue')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            f.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 4).attr('result', 'blur');
            f.append('feComposite').attr('in', 'blur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            f.append('feFlood').attr('flood-color', '#4EB5FF').attr('flood-opacity', 0.9).attr('result', 'color');
            f.append('feComposite').attr('in', 'color').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredGlow');
            f.append('feBlend').attr('in', 'SourceGraphic').attr('in2', 'coloredGlow').attr('mode', 'normal');
        }
        if (defs.select('#innerGlowYellow').empty()) {
            const f = defs.append('filter')
                .attr('id', 'innerGlowYellow')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            f.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 4).attr('result', 'blur');
            f.append('feComposite').attr('in', 'blur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            f.append('feFlood').attr('flood-color', '#FFC94A').attr('flood-opacity', 0.9).attr('result', 'color');
            f.append('feComposite').attr('in', 'color').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredGlow');
            f.append('feBlend').attr('in', 'SourceGraphic').attr('in2', 'coloredGlow').attr('mode', 'normal');
        }
        if (defs.select('#innerGlowPink').empty()) {
            const f = defs.append('filter')
                .attr('id', 'innerGlowPink')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            f.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 4).attr('result', 'blur');
            f.append('feComposite').attr('in', 'blur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            f.append('feFlood').attr('flood-color', '#FF66B3').attr('flood-opacity', 0.9).attr('result', 'color');
            f.append('feComposite').attr('in', 'color').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredGlow');
            f.append('feBlend').attr('in', 'SourceGraphic').attr('in2', 'coloredGlow').attr('mode', 'normal');
        }
        // Outer glow filters (drop-shadow style) for bubbles
        if (defs.select('#bubbleGlowGreen').empty()) {
            const g = defs.append('filter')
                .attr('id', 'bubbleGlowGreen')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            // Reduce outer glow blur so glows are smaller and less fuzzy
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 6).attr('result', 'blurOuter');
            g.append('feFlood').attr('flood-color', '#00ff41').attr('flood-opacity', 0.85).attr('result', 'colorOuter');
            g.append('feComposite').attr('in', 'colorOuter').attr('in2', 'blurOuter').attr('operator', 'in').attr('result', 'coloredOuter');
            // small inner glow to blend nicely
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blurInner');
            g.append('feComposite').attr('in', 'blurInner').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            g.append('feFlood').attr('flood-color', '#00ff41').attr('flood-opacity', 1.0).attr('result', 'colorInner');
            g.append('feComposite').attr('in', 'colorInner').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredInner');
            // Merge outer glow, inner glow and original graphic
            g.append('feMerge').append('feMergeNode').attr('in', 'coloredOuter');
            g.select('feMerge').append('feMergeNode').attr('in', 'coloredInner');
            g.select('feMerge').append('feMergeNode').attr('in', 'SourceGraphic');
        }
        if (defs.select('#bubbleGlowRed').empty()) {
            const g2 = defs.append('filter')
                .attr('id', 'bubbleGlowRed')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            g2.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 6).attr('result', 'blurOuter');
            g2.append('feFlood').attr('flood-color', '#ff0066').attr('flood-opacity', 0.85).attr('result', 'colorOuter');
            g2.append('feComposite').attr('in', 'colorOuter').attr('in2', 'blurOuter').attr('operator', 'in').attr('result', 'coloredOuter');
            g2.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blurInner');
            g2.append('feComposite').attr('in', 'blurInner').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            g2.append('feFlood').attr('flood-color', '#ff0066').attr('flood-opacity', 1.0).attr('result', 'colorInner');
            g2.append('feComposite').attr('in', 'colorInner').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredInner');
            g2.append('feMerge').append('feMergeNode').attr('in', 'coloredOuter');
            g2.select('feMerge').append('feMergeNode').attr('in', 'coloredInner');
            g2.select('feMerge').append('feMergeNode').attr('in', 'SourceGraphic');
        }
        if (defs.select('#bubbleGlowBlue').empty()) {
            const g = defs.append('filter')
                .attr('id', 'bubbleGlowBlue')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 6).attr('result', 'blurOuter');
            g.append('feFlood').attr('flood-color', '#4EB5FF').attr('flood-opacity', 0.85).attr('result', 'colorOuter');
            g.append('feComposite').attr('in', 'colorOuter').attr('in2', 'blurOuter').attr('operator', 'in').attr('result', 'coloredOuter');
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blurInner');
            g.append('feComposite').attr('in', 'blurInner').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            g.append('feFlood').attr('flood-color', '#4EB5FF').attr('flood-opacity', 1.0).attr('result', 'colorInner');
            g.append('feComposite').attr('in', 'colorInner').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredInner');
            g.append('feMerge').append('feMergeNode').attr('in', 'coloredOuter');
            g.select('feMerge').append('feMergeNode').attr('in', 'coloredInner');
            g.select('feMerge').append('feMergeNode').attr('in', 'SourceGraphic');
        }
        if (defs.select('#bubbleGlowYellow').empty()) {
            const g = defs.append('filter')
                .attr('id', 'bubbleGlowYellow')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 6).attr('result', 'blurOuter');
            g.append('feFlood').attr('flood-color', '#FFC94A').attr('flood-opacity', 0.85).attr('result', 'colorOuter');
            g.append('feComposite').attr('in', 'colorOuter').attr('in2', 'blurOuter').attr('operator', 'in').attr('result', 'coloredOuter');
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blurInner');
            g.append('feComposite').attr('in', 'blurInner').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            g.append('feFlood').attr('flood-color', '#FFC94A').attr('flood-opacity', 1.0).attr('result', 'colorInner');
            g.append('feComposite').attr('in', 'colorInner').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredInner');
            g.append('feMerge').append('feMergeNode').attr('in', 'coloredOuter');
            g.select('feMerge').append('feMergeNode').attr('in', 'coloredInner');
            g.select('feMerge').append('feMergeNode').attr('in', 'SourceGraphic');
        }
        if (defs.select('#bubbleGlowPink').empty()) {
            const g = defs.append('filter')
                .attr('id', 'bubbleGlowPink')
                .attr('filterUnits', 'userSpaceOnUse')
                .attr('x', '-50%')
                .attr('y', '-50%')
                .attr('width', '200%')
                .attr('height', '200%');
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 6).attr('result', 'blurOuter');
            g.append('feFlood').attr('flood-color', '#FF66B3').attr('flood-opacity', 0.85).attr('result', 'colorOuter');
            g.append('feComposite').attr('in', 'colorOuter').attr('in2', 'blurOuter').attr('operator', 'in').attr('result', 'coloredOuter');
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blurInner');
            g.append('feComposite').attr('in', 'blurInner').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            g.append('feFlood').attr('flood-color', '#FF66B3').attr('flood-opacity', 1.0).attr('result', 'colorInner');
            g.append('feComposite').attr('in', 'colorInner').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredInner');
            g.append('feMerge').append('feMergeNode').attr('in', 'coloredOuter');
            g.select('feMerge').append('feMergeNode').attr('in', 'coloredInner');
            g.select('feMerge').append('feMergeNode').attr('in', 'SourceGraphic');
        }

        // Simple collision resolver (iterative) to avoid overlaps without running a force simulation
        // Kept for fallback but the force simulation below will handle collisions and center pull
        const resolveCollisions = (items: any[], iterations = 4, padding = 2) => {
            for (let it = 0; it < iterations; it++) {
                for (let i = 0; i < items.length; i++) {
                    for (let j = i + 1; j < items.length; j++) {
                        const a = items[i];
                        const b = items[j];
                        const dx = b.x - a.x;
                        const dy = b.y - a.y;
                        let dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
                        const minDist = (a.r || 24) + (b.r || 24) + padding;
                        if (dist < minDist) {
                            const overlap = (minDist - dist) / 2;
                            const ux = dx / dist;
                            const uy = dy / dist;
                            a.x -= ux * overlap;
                            a.y -= uy * overlap;
                            b.x += ux * overlap;
                            b.y += uy * overlap;
                        }
                    }
                }
            }
            // Keep nodes inside container bounds after resolving collisions (work in world coords)
            const width = containerRef.current ? containerRef.current.clientWidth : window.innerWidth;
            const height = containerRef.current ? containerRef.current.clientHeight : window.innerHeight;
            const tr = transformRef.current || { scale: 1, tx: 0, ty: 0 };
            const s = tr.scale || 1;
            const tx = tr.tx || 0;
            const ty = tr.ty || 0;
            for (const n of items) {
                const r = n.r || 24;
                const minX = (r - tx) / s;
                const maxX = (width - r - tx) / s;
                const minY = (r - ty) / s;
                const maxY = (height - r - ty) / s;
                n.x = Math.max(minX, Math.min(maxX, n.x));
                n.y = Math.max(minY, Math.min(maxY, n.y));
            }
        };

        // Data-join: render nodes entirely with D3 (enter / update / exit)
        const key = (d: any) => d.id || d.question || d.marketSlug || JSON.stringify(d);

        // Ensure a content group to allow global scaling/centering
        const content = svg.select('g.mira-content').empty() ? svg.append('g').attr('class', 'mira-content') : svg.select('g.mira-content');

        const sel = content.selectAll<SVGGElement, any>('g.pred-node').data(nodes, key as any);

        // EXIT
        sel.exit().transition().duration(200).style('opacity', 0).remove();

        // ENTER
        const enter = sel.enter().append('g').attr('class', 'pred-node').attr('data-id', (d: any) => key(d));
        // Color bubbles by decision when available. Map to classes: yes/no/up/down/other
        enter.append('circle')
            .attr('class', (d: any) => {
                const raw = String((d.decision || d.position || d.raw?.decision || d.raw?.side || '') || '').toUpperCase();
                if (raw === 'YES' || raw.startsWith('Y')) return 'bubble yes';
                if (raw === 'NO' || raw.startsWith('N')) return 'bubble no';
                if (raw === 'UP') return 'bubble up';
                if (raw === 'DOWN') return 'bubble down';
                // fallback to change sign if no explicit decision
                if ((d.change ?? 0) >= 0) return 'bubble yes';
                return 'bubble other';
            })
            .attr('r', (d: any) => d.r)
            .attr('stroke', (d: any) => {
                const raw = String((d.decision || d.position || d.raw?.decision || d.raw?.side || '') || '').toUpperCase();
                if (raw === 'YES' || raw.startsWith('Y')) return 'hsl(var(--trade-yes))';
                if (raw === 'NO' || raw.startsWith('N')) return 'hsl(var(--trade-no))';
                if (raw === 'UP') return 'hsl(var(--trade-up))';
                if (raw === 'DOWN') return 'hsl(var(--trade-down))';
                return 'hsl(var(--trade-other))';
            });
        // Three-line label: decision (YES/NO) above, amount ($) in the middle, title last below
        enter.append('text').attr('class', 'decision').text((d: any) => getDecisionLabel(d));
        enter.append('text').attr('class', 'amount').text((d: any) => getAmountLabel(d));
        enter.append('text').attr('class', 'title').text((d: any) => getTitleLabel(d));

        const merged = enter.merge(sel as any);

        // D3 drag attached to these G nodes — integrate with force simulation via fx/fy
        const drag = d3.drag<SVGGElement, any>()
            .on('start', function (event, d) {
                d3.select(this).raise();
                d3.select(this).select('circle').style('cursor', 'grabbing');
                // ensure simulation is awake
                if (simRef.current) simRef.current.alphaTarget(0.3).restart();
                // pin the node to its current position (convert screen->world coords)
                try {
                    const s = transformRef.current.scale || 1;
                    const tx = transformRef.current.tx || 0;
                    const ty = transformRef.current.ty || 0;
                    d.fx = d.x != null ? d.x : ((event.x - tx) / s);
                    d.fy = d.y != null ? d.y : ((event.y - ty) / s);
                } catch (e) {
                    d.fx = d.x; d.fy = d.y;
                }
            })
            .on('drag', function (event, d: any) {
                // pin to pointer location (convert screen coords to world coords and clamp to world bounds)
                try {
                    const s = transformRef.current.scale || 1;
                    const tx = transformRef.current.tx || 0;
                    const ty = transformRef.current.ty || 0;
                    const r = d.r || 24;
                    const widthNow = containerRef.current?.clientWidth || window.innerWidth;
                    const heightNow = containerRef.current?.clientHeight || window.innerHeight;
                    const minWorldX = (r - tx) / s;
                    const maxWorldX = (widthNow - r - tx) / s;
                    const minWorldY = (r - ty) / s;
                    const maxWorldY = (heightNow - r - ty) / s;
                    const worldX = (event.x - tx) / s;
                    const worldY = (event.y - ty) / s;
                    d.fx = Math.max(minWorldX, Math.min(maxWorldX, worldX));
                    d.fy = Math.max(minWorldY, Math.min(maxWorldY, worldY));
                } catch (e) {
                    d.fx = Math.max(d.r || 24, Math.min((containerRef.current?.clientWidth || window.innerWidth) - (d.r || 24), event.x));
                    d.fy = Math.max(d.r || 24, Math.min((containerRef.current?.clientHeight || window.innerHeight) - (d.r || 24), event.y));
                }
            })
            .on('end', function (_event, d: any) {
                // release pin so simulation can pull back to center
                d.fx = null;
                d.fy = null;
                if (simRef.current) simRef.current.alphaTarget(0.01);
                d3.select(this).select('circle').style('cursor', null);
            });

        merged.call(drag as any).on('click', function (event: any, d: any) {
            event.stopPropagation();
            try {
                // Normalize node shape to the canonical PredictionNodeData used elsewhere
                const sd: any = d || {};
                const confidenceVal = sd.probability ?? sd.price ?? sd.raw?.confidence ?? sd.raw?.probability ?? sd.raw?.price ?? undefined;
                const normalizedProb = normalizeConfidence(confidenceVal);
                const constructed: any = {
                    id: sd.marketId || sd.id || String(sd.id || sd.market || sd.marketId || ''),
                    question: sd.market || sd.question || sd.raw?.marketQuestion || sd.raw?.market || sd.raw?.title || 'Unknown Market',
                    probability: normalizedProb,
                    position: (sd.decision === 'YES' || sd.position === 'YES') ? 'YES' : ((sd.decision === 'NO' || sd.position === 'NO') ? 'NO' : (sd.position || 'YES')),
                    price: normalizedProb,
                    change: sd.change ?? sd.raw?.change ?? 0,
                    agentName: sd.agentName || sd.raw?.agentName || sd.raw?.agent || '',
                    agentEmoji: sd.agentEmoji || sd.raw?.agentEmoji || sd.raw?.agent_emoji || '',
                    reasoning: sd.reasoning || (Array.isArray(sd.fullReasoning) ? sd.fullReasoning.join(' ') : sd.raw?.reasoning || ''),
                    category: sd.category || sd.raw?.category || undefined,
                    marketSlug: sd.marketSlug || sd.raw?.slug || sd.raw?.marketSlug || undefined,
                    conditionId: sd.conditionId || sd.raw?.conditionId || undefined,
                    imageUrl: sd.imageUrl || sd.image || sd.raw?.imageUrl || sd.raw?.image || undefined,
                    createdAt: sd.createdAt || sd.raw?.createdAt || sd.raw?.created_at || undefined,
                    endDate: sd.endDate || sd.raw?.endDate || sd.raw?.end_date || sd.raw?.ends_at || undefined,
                    startDate: sd.startDate || sd.raw?.startDate || sd.raw?.start_date || sd.raw?.starts_at || undefined,
                    volume: sd.volume ?? sd.raw?.volume ?? sd.raw?.volume24h ?? sd.raw?.marketVolume ?? undefined,
                    liquidity: sd.liquidity ?? sd.raw?.liquidity ?? 0,
                    predicted: true,
                };
                // mark market-sourced nodes so downstream panels can render accordingly
                constructed.isMarket = !!(sd && (sd.__isMarket || sd.isMarket));
                // Attach agent-specific bet fields so MarketDetailsPanel can display them
                constructed.bet_amount = sd.bet_amount ?? sd.raw?.bet_amount ?? sd.investmentUsd ?? sd.raw?.investmentUsd ?? sd.raw?.bet ?? sd.raw?.amount ?? undefined;
                constructed.investmentUsd = sd.investmentUsd ?? sd.raw?.investmentUsd ?? sd.bet_amount ?? sd.raw?.bet_amount ?? undefined;
                constructed.decision = sd.decision ?? sd.position ?? sd.raw?.decision ?? sd.raw?.side ?? undefined;

                // If markets map contains a canonical market entry for this id/slug, copy canonical fields
                try {
                    // Try multiple candidate keys (ids, slugs, market, predictionId, nested raw values)
                    const candidates = [
                        sd.marketId,
                        sd.market,
                        sd.raw?.marketId,
                        sd.raw?.market,
                        sd.raw?.predictionId,
                        sd.id,
                        sd.raw?.id,
                        sd.marketSlug,
                        sd.raw?.slug,
                        sd.raw?.marketSlug,
                        sd.raw?.conditionId,
                    ].filter(Boolean).map(String);

                    let marketEntry: any = null;
                    for (const c of candidates) {
                        // try exact lookup
                        const found = getMarketEntry(c);
                        if (found) {
                            marketEntry = found; break;
                        }
                        // try extracting a numeric id sequence (some keys include prefixes)
                        const m = c.match(/(\d{3,})/);
                        if (m && m[1]) {
                            const found2 = getMarketEntry(m[1]);
                            if (found2) { marketEntry = found2; break; }
                        }
                    }

                    if (marketEntry) {
                        // Prefer canonical numeric volume fields; coerce to numbers when possible
                        const toNum = (v: any) => {
                            if (v === undefined || v === null) return undefined;
                            if (typeof v === 'number' && isFinite(v)) return v;
                            const n = Number(v);
                            return isFinite(n) ? n : undefined;
                        };

                        const v = toNum(marketEntry.volume ?? marketEntry.total_volume ?? marketEntry.volume_all_time ?? marketEntry.volume_all ?? marketEntry.totalVolume);
                        if (v !== undefined) constructed.volume = constructed.volume ?? v;

                        const v24 = toNum(marketEntry.volume24h ?? marketEntry.volume_24h ?? marketEntry.volume_24hr ?? marketEntry.volume24 ?? marketEntry.volume_24hrs);
                        if (v24 !== undefined) constructed.volume24h = constructed.volume24h ?? v24;

                        const tot = toNum(marketEntry.total_volume ?? marketEntry.volume_all_time ?? marketEntry.volume_all ?? marketEntry.totalVolume);
                        if (tot !== undefined) constructed.total_volume = constructed.total_volume ?? tot;

                        const volAll = toNum(marketEntry.volume_all_time ?? marketEntry.volume_all ?? marketEntry.total_volume);
                        if (volAll !== undefined) constructed.volume_all_time = constructed.volume_all_time ?? volAll;

                        constructed.liquidity = constructed.liquidity ?? (toNum(marketEntry.liquidity) ?? toNum(marketEntry.liquidity_amount));
                        constructed.yesPrice = constructed.yesPrice ?? (marketEntry.yes_price ?? marketEntry.yesPrice ?? marketEntry.yesPrice);
                        constructed.noPrice = constructed.noPrice ?? (marketEntry.no_price ?? marketEntry.noPrice ?? marketEntry.noPrice);
                        constructed.outcomes = constructed.outcomes ?? marketEntry.outcomes ?? constructed.outcomes;
                        constructed.createdAt = constructed.createdAt ?? (marketEntry.created_at ?? marketEntry.createdAt ?? constructed.createdAt);
                        constructed.endDate = constructed.endDate ?? (marketEntry.end_date ?? marketEntry.ends_at ?? marketEntry.endDate ?? constructed.endDate);
                        constructed.marketSlug = constructed.marketSlug ?? (marketEntry.slug ?? marketEntry.marketSlug ?? constructed.marketSlug);
                        constructed.conditionId = constructed.conditionId ?? (marketEntry.conditionId ?? marketEntry.condition_id ?? constructed.conditionId);
                    }
                } catch (e) { /* ignore */ }

                onBubbleClick?.(constructed as any);
            } catch (e) {
                try { onBubbleClick?.(d); } catch (err) { /* ignore */ }
            }
        });

        // set initial / updated positions
        merged.attr('transform', (d: any) => `translate(${d.x},${d.y})`);

        // Update circle class on enter+update so coloring matches data (yes/no/up/down/other)
        merged.select('circle').attr('class', (d: any) => {
            const raw = String((d.decision || d.position || d.raw?.decision || d.raw?.side || '') || '').toUpperCase();
            if (raw === 'YES' || raw.startsWith('Y')) return 'bubble yes';
            if (raw === 'NO' || raw.startsWith('N')) return 'bubble no';
            if (raw === 'UP') return 'bubble up';
            if (raw === 'DOWN') return 'bubble down';
            if ((d.change ?? 0) >= 0) return 'bubble yes';
            return 'bubble other';
        }).attr('r', (d: any) => d.r)
            .attr('stroke', (d: any) => {
                const raw = String((d.decision || d.position || d.raw?.decision || d.raw?.side || '') || '').toUpperCase();
                if (raw === 'YES' || raw.startsWith('Y')) return 'hsl(var(--trade-yes))';
                if (raw === 'NO' || raw.startsWith('N')) return 'hsl(var(--trade-no))';
                if (raw === 'UP') return 'hsl(var(--trade-up))';
                if (raw === 'DOWN') return 'hsl(var(--trade-down))';
                return 'hsl(var(--trade-other))';
            })
            .attr('filter', (d: any) => {
                const raw = String((d.decision || d.position || d.raw?.decision || d.raw?.side || '') || '').toUpperCase();
                if (raw === 'YES' || raw.startsWith('Y')) return 'url(#bubbleGlowGreen)';
                if (raw === 'NO' || raw.startsWith('N')) return 'url(#bubbleGlowRed)';
                if (raw === 'UP') return 'url(#bubbleGlowBlue)';
                if (raw === 'DOWN') return 'url(#bubbleGlowYellow)';
                return 'url(#bubbleGlowPink)';
            })
            .attr('stroke-width', 3);

        // If a node provides an imageUrl (or image_url), create/update an objectBoundingBox pattern
        // and apply it as the circle fill so images are clipped to the circle and scale correctly.
        merged.each(function (d: any) {
            // Accept many variants including agent prediction aliases and market aliases
            let img = d.image_url || d.imageUrl || d.market_image || d.market_image_url || d.image || d.image_Url || d.imageURL || d.image_url || d.thumb || d.icon || null;
            // If node lacks an image but has a marketId, re-check the markets map at render time
            try {
                if (!img && (d.marketId || d.market)) {
                    const me = getMarketEntry(d.marketId || d.market);
                    if (me) {
                        img = me.image || me.imageUrl || me.image_url || me.thumb || me.logo || img || null;
                        // ensure display title is canonical from market
                        if (me.question || me.title) d.market = me.question || me.title;
                        // resolved image at render-time (verbose log removed)
                    }
                }
            } catch (e) { }
            const keyId = (d.id || d.market || d.marketId || d.question || JSON.stringify(d)).toString();
            // Create an ID safe for `querySelector` by allowing only alphanumerics, underscore and hyphen
            const safeId = 'patt-' + keyId.replace(/[^a-zA-Z0-9_-]/g, '_');
            const applyPattern = (url: string | null) => {
                // No proxy or fallback: attempt to fetch the image directly from the provided URL.
                // If `gs://` is provided, convert to the public storage.googleapis.com URL.
                if (!url) {
                    // clear any previous object URL
                    try {
                        if ((d as any)._objUrl) {
                            URL.revokeObjectURL((d as any)._objUrl);
                            delete (d as any)._objUrl;
                        }
                    } catch (e) { }
                    d3.select(this).select('circle').style('fill', null);
                    return;
                }

                let fetchUrl = String(url);
                try {
                    if (fetchUrl.startsWith('gs://')) {
                        // convert gs://bucket/path -> https://storage.googleapis.com/bucket/path
                        const without = fetchUrl.replace(/^gs:\/\//, '');
                        const parts = without.split('/');
                        const bucket = parts.shift();
                        const path = parts.join('/');
                        if (bucket) fetchUrl = `https://storage.googleapis.com/${bucket}/${path}`;
                    }
                } catch (e) {
                    // failed to convert gs:// url (verbose log removed)
                }

                let patt = defs.select(`#${safeId}`);
                if (patt.empty()) {
                    patt = defs.append('pattern').attr('id', safeId)
                        .attr('patternUnits', 'objectBoundingBox')
                        .attr('patternContentUnits', 'objectBoundingBox')
                        .attr('width', 1)
                        .attr('height', 1);
                    patt.append('image')
                        .attr('preserveAspectRatio', 'xMidYMid slice')
                        .attr('width', 1)
                        .attr('height', 1)
                        .attr('href', fetchUrl)
                        .attr('xlink:href', fetchUrl);
                    // Append a semi-transparent rect on top to darken images for readability
                    patt.append('rect')
                        .attr('width', 1)
                        .attr('height', 1)
                        .attr('fill', '#000')
                        .attr('opacity', IMAGE_OVERLAY_OPACITY);
                } else {
                    patt.select('image')
                        .attr('href', fetchUrl)
                        .attr('xlink:href', fetchUrl);
                    // Update overlay opacity if present
                    const overlay = patt.select('rect');
                    if (!overlay.empty()) overlay.attr('opacity', IMAGE_OVERLAY_OPACITY);
                }

                // Attach load/error listeners to the image element for debugging (only once)
                try {
                    const imgNode = (patt.select('image').node() as SVGImageElement | null);
                    if (imgNode && !(imgNode as any).__mira_listeners_attached) {
                        // listeners intentionally not logging to reduce verbosity
                        (imgNode as any).__mira_listeners_attached = true;
                    }
                } catch (e) {
                    // ignore
                }

                // Apply pattern as inline style so CSS fill rules don't override it
                d3.select(this).select('circle').style('fill', `url(#${safeId})`);
            };

            // Only use image provided by Firebase market object. No server fallback.
            applyPattern(img || null);
        });

        // Update text content on enter+update: put decision where the title used to be,
        // then amount below. Decision is colored green for YES and red for NO.
        merged.select('text.decision')
            .attr('y', (d: any) => -Math.round((d.r || 24) * 0.18))
            // Increase market slug font-size: larger multiplier and higher minimum
            .attr('font-size', (d: any) => d && d.__isMarket ? Math.max(16, Math.round((d.r || 24) * 0.85)) : Math.max(12, Math.round((d.r || 24) * 0.48)))
            .attr('font-weight', '900')
            .attr('stroke', '#000')
            .attr('stroke-width', (d: any) => Math.max(0.5, Math.round((d.r || 24) * 0.06)))
            .attr('paint-order', 'stroke')
            .each(function (d: any) {
                const el = d3.select(this);
                el.selectAll('tspan').remove();

                if (d && d.__isMarket) {
                    // Prepare slug: break after 14 chars, truncate after 24 chars total
                    const slugRaw = String(d.market || d.marketSlug || '');
                    const maxTotal = 24;
                    const firstLineLen = 14;
                    let first = slugRaw.slice(0, firstLineLen);
                    let rest = slugRaw.slice(firstLineLen, maxTotal);
                    if (slugRaw.length > maxTotal) {
                        rest = rest.slice(0, Math.max(0, maxTotal - firstLineLen));
                        // append ellipsis when truncated
                        if (rest.length > 0) rest = rest.replace(/\s+$/, '') + '…';
                        else first = first.slice(0, Math.max(0, first.length - 1)) + '…';
                    }

                    // First tspan (line 1)
                    el.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '0')
                        .attr('fill', '#ffffff')
                        .text(first);

                    // Second tspan (line 2) if any
                    if (rest && rest.length > 0) {
                        el.append('tspan')
                            .attr('x', 0)
                            .attr('dy', '1.05em')
                            .attr('fill', '#ffffff')
                            .text(rest);
                    }
                } else {
                    // Default behavior for prediction decision labels
                    const label = getDecisionLabel(d);
                    el.append('tspan')
                        .attr('x', 0)
                        .attr('dy', '0')
                        .attr('fill', (() => {
                            try {
                                const raw = String((d.decision || d.position || d.raw?.decision || d.raw?.side || '') || '').toUpperCase();
                                if (raw === 'YES' || raw.startsWith('Y')) return 'hsl(var(--trade-yes))';
                                if (raw === 'NO' || raw.startsWith('N')) return 'hsl(var(--trade-no))';
                                if (raw === 'UP') return 'hsl(var(--trade-up))';
                                if (raw === 'DOWN') return 'hsl(var(--trade-down))';
                            } catch (e) { }
                            return 'hsl(var(--trade-other))';
                        })())
                        .text(label);
                }
            });

        merged.select('text.amount')
            .text((d: any) => d && d.__isMarket ? formatAbbrevNumber(d.volume || d.investmentUsd || 0) : getAmountLabel(d))
            .attr('y', (d: any) => d && d.__isMarket ? Math.round((d.r || 24) * 0.32) : Math.round((d.r || 24) * 0.12))
            // Market volumes smaller, predictions keep previous size
            .attr('font-size', (d: any) => d && d.__isMarket ? Math.max(10, Math.round((d.r || 24) * 0.28)) : Math.max(12, Math.round((d.r || 24) * 0.38)))
            .attr('fill', '#ffffff')
            .attr('font-weight', '800');

        // Title displayed below the amount — single-line truncated to 10 chars
        merged.select('text.title')
            .text((d: any) => d && d.__isMarket ? '' : getTitleLabel(d))
            .attr('y', (d: any) => Math.round((d.r || 24) * 0.38))
            .attr('font-size', (d: any) => Math.max(8, Math.round((d.r || 24) * 0.18)))
            .attr('fill', '#ffffff')
            .attr('font-weight', '800');

        // --- Force simulation: create once and update nodes when items change ---
        if (!simRef.current) {
            const sim = d3.forceSimulation()
                .velocityDecay(0.3)
                .force('x', d3.forceX(centerX).strength(0.06))
                .force('y', d3.forceY(centerY).strength(0.06))
                .force('collide', d3.forceCollide().radius((d: any) => (d.r || 24) + 2).iterations(2))
                .alphaTarget(0.01)
                .on('tick', () => {
                    // update node positions inside the content group
                    content.selectAll('g.pred-node').attr('transform', (d: any) => `translate(${d.x},${d.y})`);
                    // We intentionally avoid per-tick zoom calculations here. Zoom is computed
                    // on node-set changes and on resize using a debounced function below.
                });

            sim.nodes(nodes);
            simRef.current = sim;
        } else {
            // update nodes and center forces (center may change on resize)
            simRef.current.nodes(nodes);
            const fx = simRef.current.force('x') as d3.ForceX<any>;
            const fy = simRef.current.force('y') as d3.ForceY<any>;
            if (fx) (fx as any).x(centerX);
            if (fy) (fy as any).y(centerY);
            simRef.current.alpha(0.3).restart();
        }

        // Auto-fit/auto-zoom disabled: nodes are positioned and the user can pan/zoom manually.

        // --- Background pan/drag support ---
        // Insert a transparent rect behind the content group to capture drag events for panning.
        let bg = svg.select('rect.mira-bg');
        if (bg.empty()) {
            bg = svg.insert('rect', 'g.mira-content')
                .attr('class', 'mira-bg')
                .attr('x', 0)
                .attr('y', 0)
                .attr('width', width)
                .attr('height', height)
                .style('fill', 'transparent')
                .style('cursor', 'grab')
                .attr('pointer-events', 'all');

            const bgDrag = d3.drag<SVGRectElement, any>()
                .on('start', function (event) {
                    // If the original DOM event started on a node (or inside a node),
                    // don't start panning here to avoid conflicting with node drag.
                    try {
                        const se: any = (event as any).sourceEvent;
                        if (se && se.target) {
                            const el = (se.target as Element).closest ? (se.target as Element).closest('g.pred-node, circle, .pred-node') : null;
                            if (el) return; // abort starting background pan
                        }
                    } catch (e) { }
                    try { autoZoomRef.current = false; } catch (e) { }
                    bg.style('cursor', 'grabbing');
                    panStartRef.current = { x: event.x, y: event.y };
                })
                .on('drag', function (event) {
                    try {
                        const s = transformRef.current.scale || 1;
                        // Adjust translation by delta divided by scale (transform is translate(...) scale(s))
                        // For transform = scale(s) translate(tx,ty), translation is in screen coords
                        transformRef.current.tx = (transformRef.current.tx || 0) + (event.dx || 0);
                        transformRef.current.ty = (transformRef.current.ty || 0) + (event.dy || 0);
                        content.attr('transform', `translate(${transformRef.current.tx},${transformRef.current.ty}) scale(${transformRef.current.scale})`);
                    } catch (e) { /* ignore */ }
                })
                .on('end', function () { bg.style('cursor', 'grab'); panStartRef.current = null; });

            bg.call(bgDrag as any);
        } else {
            // Update bg size on re-render
            bg.attr('width', width).attr('height', height);
        }

        // Wheel-to-zoom: zoom toward mouse pointer with clamped scale
        const onWheel = (e: any) => {
            try {
                e.preventDefault();
                autoZoomRef.current = false;
                const prev = transformRef.current || { scale: 1, tx: 0, ty: 0 };
                const oldScale = prev.scale || 1;
                // Use exponential zoom for smoothness; adjust intensity as needed
                const zoomIntensity = 0.0018;
                const factor = Math.exp(-e.deltaY * zoomIntensity);
                const newScale = Math.max(0.25, Math.min(4, oldScale * factor));

                // Compute pointer position relative to SVG
                const rect = svgEl.getBoundingClientRect();
                const px = (e.clientX || 0) - rect.left;
                const py = (e.clientY || 0) - rect.top;

                // Maintain world point under cursor while scaling
                const ratio = newScale / oldScale;
                const txPrev = prev.tx || 0;
                const tyPrev = prev.ty || 0;
                const newTx = px - (px - txPrev) * ratio;
                const newTy = py - (py - tyPrev) * ratio;

                transformRef.current = { scale: newScale, tx: newTx, ty: newTy };
                content.attr('transform', `translate(${newTx},${newTy}) scale(${newScale})`);
            } catch (err) { /* ignore */ }
        };

        // Attach non-passive wheel listener so we can prevent page scroll
        try { svgEl.addEventListener('wheel', onWheel, { passive: false }); } catch (e) { }

        const handleResize = () => {
            const w = window.innerWidth, h = window.innerHeight;
            svg.attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);
            // auto-fit removed: no automatic zoom recomputation on resize
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            try { svgEl.removeEventListener('wheel', onWheel as any); } catch (e) { }
            svg.selectAll("g.pred-node").on('.drag', null as any);
        };
    }, [fetchedItems, onBubbleClick]);

    // Helper to apply a transform programmatically (used by zoom buttons)
    const applyTransform = (scale: number, tx: number, ty: number) => {
        transformRef.current = { scale, tx, ty };
        try {
            const svg = d3.select(svgRef.current as any);
            const content = svg.select('g.mira-content');
            if (!content.empty()) content.transition().duration(120).attr('transform', `translate(${tx},${ty}) scale(${scale})` as any);
        } catch (e) { /* ignore */ }
    };

    const handleZoom = (factor: number) => {
        try {
            autoZoomRef.current = false;
            const prev = transformRef.current || { scale: 1, tx: 0, ty: 0 };
            const oldScale = prev.scale || 1;
            const newScale = Math.max(0.25, Math.min(4, oldScale * factor));
            const w = containerRef.current ? containerRef.current.clientWidth : window.innerWidth;
            const h = containerRef.current ? containerRef.current.clientHeight : window.innerHeight;
            const px = w / 2;
            const py = h / 2;
            // Keep viewport center fixed while scaling (translate then scale transform math)
            const ratio = newScale / oldScale;
            const tx = (prev.tx || 0) * ratio + px * (1 - ratio);
            const ty = (prev.ty || 0) * ratio + py * (1 - ratio);
            applyTransform(newScale, tx, ty);
        } catch (e) { /* ignore */ }
    };

    return (
        <div ref={containerRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0, background: "#000" }}>
            <style>{`\n                .bubble { cursor:grab; stroke-width:3; transition:all .25s; }\n                .bubble:hover { stroke:white !important; stroke-width:5 !important; }\n                .bubble.yes { stroke: hsl(var(--trade-yes)); fill: hsl(var(--trade-yes) / 0.12); }\n                .bubble.no { stroke: hsl(var(--trade-no)); fill: hsl(var(--trade-no) / 0.12); }\n                .bubble.up { stroke: hsl(var(--trade-up)); fill: hsl(var(--trade-up) / 0.12); }\n                .bubble.down { stroke: hsl(var(--trade-down)); fill: hsl(var(--trade-down) / 0.12); }\n                .bubble.other { stroke: hsl(var(--trade-other)); fill: hsl(var(--trade-other) / 0.12); }\n                .symbol { font-weight:900; font-size:14px; fill:white; text-anchor:middle; dominant-baseline:middle; pointer-events:none; }\n                .pct { font-size:12px; fill:white; text-anchor:middle; dominant-baseline:middle; pointer-events:none; }\n                .title { font-weight:800; font-size:12px; fill:white; text-anchor:middle; dominant-baseline:middle; pointer-events:none; }\n                .decision { font-size:16px; text-anchor:middle; dominant-baseline:middle; pointer-events:none; font-weight:900; }\n                .amount { fill:#fff; text-anchor:middle; dominant-baseline:middle; pointer-events:none; font-weight:800; }\n            `}</style>

            {showTitle !== false && (
                <div style={{ position: "absolute", top: 12, left: 16, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ color: '#fff', fontSize: 18, fontWeight: 800, marginRight: 8 }}>BUBBLE MAP</div>
                </div>
            )}
            {/* Zoom controls (top-center) */}
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 30, display: 'flex', gap: 8 }}>
                <button
                    title="Zoom Out"
                    onClick={() => handleZoom(1 / 1.2)}
                    style={{
                        background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.06)',
                        padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700
                    }}
                >
                    −
                </button>
                <button
                    title="Zoom In"
                    onClick={() => handleZoom(1.2)}
                    style={{
                        background: 'rgba(0,0,0,0.6)', color: '#fff', border: '1px solid rgba(255,255,255,0.06)',
                        padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700
                    }}
                >
                    +
                </button>

            </div>
            <svg ref={svgRef} style={{ width: "100%", height: "100%" }} />
            {/* Overlay messages for empty/no-data states */}
            {(() => {
                const usingItemsProp = Array.isArray(items);
                const nodeCount = (nodes || []).length;
                // If using parent-provided items and it's intentionally empty, show 'No matches'
                if (usingItemsProp && nodeCount === 0) {
                    return (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, pointerEvents: 'none' }}>
                            <div style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '12px 18px', borderRadius: 8, fontSize: 14 }}>
                                No matches
                            </div>
                        </div>
                    );
                }

                // Intentionally do not show a connecting message while waiting for RTDB payloads
                // (avoids transient text before bubbles render). The canvas will render
                // nothing in this interim; explicit empty states still show meaningful messages.

                // If subscribed but received empty array, show no live predictions
                if (!usingItemsProp && Array.isArray(fetchedItems) && fetchedItems.length === 0) {
                    return (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, pointerEvents: 'none' }}>
                            <div style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '12px 18px', borderRadius: 8, fontSize: 14 }}>
                                No live predictions
                            </div>
                        </div>
                    );
                }

                return null;
            })()}
        </div>
    );
}

function radiusShiftSafe(r: number) {
    if (!isFinite(r) || r <= 0) return 24;
    return Math.max(10, r);
}

function getTitleLabel(d: any) {
    const title = d.market || d.question || d.symbol || d.id || "?";
    const s = String(title).trim();
    // Show up to 10 characters, add ellipsis when longer
    const max = 10;
    if (s.length <= max) return s;
    return s.slice(0, max) + '…';
}

export function getDecisionLabel(d: any) {
    const dec = (d.decision || d.position || (typeof d.probability === 'number' ? (d.probability >= 50 ? 'YES' : 'NO') : null));
    if (dec) {
        const s = String(dec).toUpperCase();
        return (s === 'YES' || s === 'NO') ? s : (s.startsWith('Y') ? 'YES' : (s.startsWith('N') ? 'NO' : s));
    }
    // If no decision, but we have a volume (markets view), show rounded dollar volume
    const vol = d.volume || d._volumeNumeric || d.volume24h || 0;
    if (vol && !isNaN(Number(vol))) return `$${Math.round(Number(vol))}`;
    return '';
}

function getAmountLabel(d: any) {
    const amt = (d.investmentUsd != null && !isNaN(Number(d.investmentUsd))) ? Number(d.investmentUsd) : null;
    if (amt == null) return '';
    // Show integer dollars (no cents) as requested
    return `$${Math.round(amt)}`;
}

function formatChange(c: any) {
    let n = typeof c === 'number' ? c : (c ? Number(c) : 0);
    if (isNaN(n)) return "0.00%";
    // If value looks like a fraction (0-1), convert to percent
    if (Math.abs(n) <= 1) n = n * 100;
    return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function formatAbbrevNumber(n: any) {
    let num = typeof n === 'number' ? n : (n ? Number(n) : 0);
    if (!isFinite(num) || isNaN(num)) return '0';
    num = Math.round(num);
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000) {
        return (Math.round((num / 1_000_000_000) * 10) / 10) + 'B';
    }
    if (abs >= 1_000_000) {
        return (Math.round((num / 1_000_000) * 10) / 10) + 'M';
    }
    if (abs >= 1_000) {
        return (Math.round((num / 1_000) * 10) / 10) + 'K';
    }
    return String(num);
}
