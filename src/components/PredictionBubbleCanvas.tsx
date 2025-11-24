"use client";

import { listenToAgentPredictions, listenToMarkets } from '@/lib/firebase/listeners';
import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { PredictionNodeData } from "./PredictionTypes";

type Props = {
    items: PredictionNodeData[];
    onBubbleClick?: (item: PredictionNodeData) => void;
};

// D3-powered bubble map. Mirrors the standalone HTML example: strong center pull,
// collision avoidance, drag with snap-back and responsive resizing. Calls
// `onBubbleClick` when a bubble is clicked.
export default function PredictionBubbleCanvas({ items = [], onBubbleClick }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    // Maintain a stable nodes map so seeded positions persist across renders
    const nodesRef = useRef<Record<string, any>>({});
    const simRef = useRef<d3.Simulation<any, undefined> | null>(null);

    const [fetchedItems, setFetchedItems] = useState<any[] | null>(null);
    const [marketsMapState, setMarketsMapState] = useState<Record<string, any>>({});
    const marketsRef = useRef<Record<string, any>>({});
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
    const IMAGE_OVERLAY_OPACITY = 0.45; // Dark overlay opacity (0 = no overlay, 1 = fully black)

    // Subscribe to Firebase `predictions` and show only agent predictions.
    useEffect(() => {
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
                            probability: p.probability ?? null,
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
    }, []);

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
        const source = (fetchedItems || []);
        const width = containerRef.current ? containerRef.current.clientWidth : window.innerWidth;
        const height = containerRef.current ? containerRef.current.clientHeight : window.innerHeight;
        const centerX = width / 2;
        const centerY = height / 2;
        // Compute a dynamic radius scale based primarily on bet amounts (investmentUsd)
        // Prefer using the largest bet to size bubbles proportionally; fall back to 100 as a sensible max.
        const betValues = (source || []).map((s: any) => Number(s.investmentUsd || s.bet_amount || 0)).filter((n: number) => !isNaN(n) && n >= 0);
        const observedMaxBet = betValues.length ? Math.max(...betValues) : 0;
        // Cap the display domain so very large bets don't dominate the visualization.
        // Use a smaller display max to reduce average bubble sizes.
        const DISPLAY_MAX_BET = 10;
        const displayMax = Math.max(6, Math.min(observedMaxBet || 0, DISPLAY_MAX_BET));
        // Use a power scale with a small exponent to compress the ratio between
        // smallest and largest bets (smaller exponent -> more compression).
        // Clamp to keep values inside domain.
        const radiusScale = d3.scalePow().exponent(0.3).domain([0, displayMax]).range([12, 56]).clamp(true as any);

        const next: Record<string, any> = {};
        (source || []).forEach((d: any) => {
            const key = d.id || d.question || d.market || d.marketSlug || JSON.stringify(d);
            const existing = nodesRef.current[key];
            // Prefer bet amount (investmentUsd / bet_amount) as the sizing score, then fall back
            const betScore = (d.investmentUsd != null && !isNaN(Number(d.investmentUsd))) ? Number(d.investmentUsd) : (d.bet_amount != null && !isNaN(Number(d.bet_amount)) ? Number(d.bet_amount) : null);
            const score = (betScore != null)
                ? betScore
                : (d.size != null)
                    ? Number(d.size)
                    : (d.confidence != null)
                        ? Number(d.confidence)
                        : (typeof d.probability === 'number')
                            ? d.probability
                            : (d.volume24h ? Math.min(Number(d.volume24h), 100) : 10);
            const r = radiusShiftSafe(radiusScale(score));
            if (existing) {
                existing.r = r;
                existing.raw = d;
                next[key] = existing;
            } else {
                // seed positions inside the container bounds
                const seedX = Math.min(Math.max(centerX + (Math.random() - 0.5) * 200, r), Math.max(10, width - r));
                const seedY = Math.min(Math.max(centerY + (Math.random() - 0.5) * 200, r), Math.max(10, height - r));
                next[key] = { ...d, r, x: seedX, y: seedY };
            }
        });

        nodesRef.current = next;
        return Object.values(next);
    }, [fetchedItems]);

    // Images are provided by Firebase markets; no external fallback fetches

    useEffect(() => {
        const container = containerRef.current;
        const svgEl = svgRef.current;
        if (!container || !svgEl) return;

        const width = container.clientWidth || window.innerWidth;
        const height = container.clientHeight || window.innerHeight;
        const centerX = width / 2;
        const centerY = height / 2;

        const svg = d3.select(svgEl).attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);

        // Ensure filters for inner glow exist on the SVG defs
        const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
        if (defs.select('#innerGlowGreen').empty()) {
            const f = defs.append('filter').attr('id', 'innerGlowGreen');
            f.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 8).attr('result', 'blur');
            f.append('feComposite').attr('in', 'blur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            f.append('feFlood').attr('flood-color', '#00ff41').attr('flood-opacity', 0.9).attr('result', 'color');
            f.append('feComposite').attr('in', 'color').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredGlow');
            f.append('feBlend').attr('in', 'SourceGraphic').attr('in2', 'coloredGlow').attr('mode', 'normal');
        }
        if (defs.select('#innerGlowRed').empty()) {
            const f2 = defs.append('filter').attr('id', 'innerGlowRed');
            f2.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 8).attr('result', 'blur');
            f2.append('feComposite').attr('in', 'blur').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            f2.append('feFlood').attr('flood-color', '#ff0066').attr('flood-opacity', 0.9).attr('result', 'color');
            f2.append('feComposite').attr('in', 'color').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredGlow');
            f2.append('feBlend').attr('in', 'SourceGraphic').attr('in2', 'coloredGlow').attr('mode', 'normal');
        }
        // Outer glow filters (drop-shadow style) for bubbles
        if (defs.select('#bubbleGlowGreen').empty()) {
            const g = defs.append('filter').attr('id', 'bubbleGlowGreen');
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 10).attr('result', 'blurOuter');
            g.append('feFlood').attr('flood-color', '#00ff41').attr('flood-opacity', 0.85).attr('result', 'colorOuter');
            g.append('feComposite').attr('in', 'colorOuter').attr('in2', 'blurOuter').attr('operator', 'in').attr('result', 'coloredOuter');
            // small inner glow to blend nicely
            g.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 4).attr('result', 'blurInner');
            g.append('feComposite').attr('in', 'blurInner').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            g.append('feFlood').attr('flood-color', '#00ff41').attr('flood-opacity', 1.0).attr('result', 'colorInner');
            g.append('feComposite').attr('in', 'colorInner').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredInner');
            // Merge outer glow, inner glow and original graphic
            g.append('feMerge').append('feMergeNode').attr('in', 'coloredOuter');
            g.select('feMerge').append('feMergeNode').attr('in', 'coloredInner');
            g.select('feMerge').append('feMergeNode').attr('in', 'SourceGraphic');
        }
        if (defs.select('#bubbleGlowRed').empty()) {
            const g2 = defs.append('filter').attr('id', 'bubbleGlowRed');
            g2.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 10).attr('result', 'blurOuter');
            g2.append('feFlood').attr('flood-color', '#ff0066').attr('flood-opacity', 0.85).attr('result', 'colorOuter');
            g2.append('feComposite').attr('in', 'colorOuter').attr('in2', 'blurOuter').attr('operator', 'in').attr('result', 'coloredOuter');
            g2.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 4).attr('result', 'blurInner');
            g2.append('feComposite').attr('in', 'blurInner').attr('in2', 'SourceAlpha').attr('operator', 'arithmetic').attr('k2', -1).attr('k3', 1).attr('result', 'innerGlow');
            g2.append('feFlood').attr('flood-color', '#ff0066').attr('flood-opacity', 1.0).attr('result', 'colorInner');
            g2.append('feComposite').attr('in', 'colorInner').attr('in2', 'innerGlow').attr('operator', 'in').attr('result', 'coloredInner');
            g2.append('feMerge').append('feMergeNode').attr('in', 'coloredOuter');
            g2.select('feMerge').append('feMergeNode').attr('in', 'coloredInner');
            g2.select('feMerge').append('feMergeNode').attr('in', 'SourceGraphic');
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
            // Keep nodes inside container bounds after resolving collisions
            const width = containerRef.current ? containerRef.current.clientWidth : window.innerWidth;
            const height = containerRef.current ? containerRef.current.clientHeight : window.innerHeight;
            for (const n of items) {
                const r = n.r || 24;
                n.x = Math.max(r, Math.min(width - r, n.x));
                n.y = Math.max(r, Math.min(height - r, n.y));
            }
        };

        // Data-join: render nodes entirely with D3 (enter / update / exit)
        const key = (d: any) => d.id || d.question || d.marketSlug || JSON.stringify(d);

        const sel = svg.selectAll<SVGGElement, any>('g.pred-node').data(nodes, key as any);

        // EXIT
        sel.exit().transition().duration(200).style('opacity', 0).remove();

        // ENTER
        const enter = sel.enter().append('g').attr('class', 'pred-node').attr('data-id', (d: any) => key(d));
        // Color bubbles by decision when available (YES -> positive, NO -> negative), otherwise fall back to change sign
        enter.append('circle')
            .attr('class', (d: any) => 'bubble ' + ((d.decision === 'YES') ? 'positive' : (d.decision === 'NO' ? 'negative' : (((d.change ?? 0) >= 0) ? 'positive' : 'negative'))))
            .attr('r', (d: any) => d.r);
        // Three-line label: title, YES/NO, $amount (we position using absolute y later)
        enter.append('text').attr('class', 'title').text((d: any) => getTitleLabel(d));
        enter.append('text').attr('class', 'decision').text((d: any) => getDecisionLabel(d));
        enter.append('text').attr('class', 'amount').text((d: any) => getAmountLabel(d));

        const merged = enter.merge(sel as any);

        // D3 drag attached to these G nodes — integrate with force simulation via fx/fy
        const drag = d3.drag<SVGGElement, any>()
            .on('start', function (event, d) {
                d3.select(this).raise();
                d3.select(this).select('circle').style('cursor', 'grabbing');
                // ensure simulation is awake
                if (simRef.current) simRef.current.alphaTarget(0.3).restart();
                // pin the node to its current position
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', function (event, d: any) {
                // pin to pointer location
                d.fx = Math.max(d.r || 24, Math.min((containerRef.current?.clientWidth || window.innerWidth) - (d.r || 24), event.x));
                d.fy = Math.max(d.r || 24, Math.min((containerRef.current?.clientHeight || window.innerHeight) - (d.r || 24), event.y));
            })
            .on('end', function (_event, d: any) {
                // release pin so simulation can pull back to center
                d.fx = null;
                d.fy = null;
                if (simRef.current) simRef.current.alphaTarget(0.01);
                d3.select(this).select('circle').style('cursor', null);
            });

        merged.call(drag as any).on('click', function (event: any, d: any) { event.stopPropagation(); onBubbleClick?.(d); });

        // set initial / updated positions
        merged.attr('transform', (d: any) => `translate(${d.x},${d.y})`);

        // Update circle class on enter+update so YES/NO coloring always matches data
        merged.select('circle').attr('class', (d: any) => {
            const dec = getDecisionLabel(d);
            if (dec === 'YES') return 'bubble positive';
            if (dec === 'NO') return 'bubble negative';
            // fall back to change sign
            return 'bubble ' + (((d.change ?? 0) >= 0) ? 'positive' : 'negative');
        }).attr('r', (d: any) => d.r)
            .attr('filter', (d: any) => {
                const dec = getDecisionLabel(d);
                if (dec === 'YES') return 'url(#bubbleGlowGreen)';
                if (dec === 'NO') return 'url(#bubbleGlowRed)';
                return null;
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

        // Update text content on enter+update and color/size decision text by YES/NO, size relative to bubble radius
        merged.select('text.title')
            .text((d: any) => getTitleLabel(d))
            .attr('y', (d: any) => -Math.round((d.r || 24) * 0.25))
            .attr('font-size', (d: any) => Math.max(8, Math.round((d.r || 24) * 0.24)))
            .attr('fill', '#ffffff')
            .attr('font-weight', '800');

        merged.select('text.decision')
            .text((d: any) => getDecisionLabel(d))
            .attr('y', (d: any) => Math.round((d.r || 24) * -0.04))
            .attr('font-size', (d: any) => Math.max(12, Math.round((d.r || 24) * 0.48)))
            .attr('fill', (d: any) => {
                const dec = getDecisionLabel(d);
                if (dec === 'YES') return '#00ff41';
                if (dec === 'NO') return '#ff0066';
                return '#ffffff';
            })
            .attr('font-weight', '900')
            .attr('stroke', '#000')
            .attr('stroke-width', (d: any) => Math.max(0.5, Math.round((d.r || 24) * 0.06)))
            .attr('paint-order', 'stroke');

        merged.select('text.amount')
            .text((d: any) => getAmountLabel(d))
            .attr('y', (d: any) => Math.round((d.r || 24) * 0.32))
            .attr('font-size', (d: any) => Math.max(9, Math.round((d.r || 24) * 0.26)))
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
                    svg.selectAll('g.pred-node').attr('transform', (d: any) => `translate(${d.x},${d.y})`);
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

        const handleResize = () => {
            const w = window.innerWidth, h = window.innerHeight;
            svg.attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            svg.selectAll("g.pred-node").on('.drag', null as any);
        };
    }, [fetchedItems, onBubbleClick]);

    return (
        <div ref={containerRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0, background: "#000" }}>
            <style>{`\n                .bubble { cursor:grab; stroke-width:3; transition:all .25s; }\n                .bubble:hover { stroke:white !important; stroke-width:5 !important; }\n                .bubble.positive { stroke:#00ff41; fill:#001a08; }\n                .bubble.negative { stroke:#ff0066; fill:#1a0008; }\n                .symbol { font-weight:900; font-size:14px; fill:white; text-anchor:middle; dominant-baseline:middle; pointer-events:none; }\n                .pct { font-size:12px; fill:white; text-anchor:middle; dominant-baseline:middle; pointer-events:none; }\n                .title { font-weight:800; font-size:12px; fill:white; text-anchor:middle; dominant-baseline:middle; pointer-events:none; }\n                .decision { font-size:16px; fill:white; text-anchor:middle; dominant-baseline:middle; pointer-events:none; font-weight:900; }\n                .amount { font-size:14px; fill:#fff; text-anchor:middle; dominant-baseline:middle; pointer-events:none; font-weight:800; }\n            `}</style>

            <div style={{ position: "absolute", top: 16, left: 20, fontSize: 20, fontWeight: 800, color: "#fff", zIndex: 10 }}>BUBBLE MAP</div>
            <svg ref={svgRef} style={{ width: "100%", height: "100%" }} />
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
    // Show up to 5 characters, add ellipsis when longer
    const max = 5;
    if (s.length <= max) return s;
    return s.slice(0, max) + '…';
}

function getDecisionLabel(d: any) {
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
