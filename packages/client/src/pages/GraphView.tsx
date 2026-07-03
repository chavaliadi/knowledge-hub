import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { Network, ZoomIn, ZoomOut, RotateCcw, Info, Link2 } from 'lucide-react';

interface Node {
  id: string;
  title: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface Link {
  id: string;
  source: string; // source node ID
  target: string; // target node ID
  type: string;
}

interface GraphViewProps {
  onViewEntry?: (entryId: string) => void;
}

export default function GraphView({ onViewEntry }: GraphViewProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Viewport zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Hover & selection states for interactive highlight
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Dragging state
  const draggedNodeId = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const width = 800;
  const height = 500;

  // Load Graph data
  useEffect(() => {
    async function fetchGraph() {
      try {
        setLoading(true);
        const data = await api.getGraphData();

        // Initialize positions in a circular layout to start simulation
        const initializedNodes = data.nodes.map((node: any, idx: number) => {
          const angle = (idx / data.nodes.length) * 2 * Math.PI;
          const radius = 180 + Math.random() * 40;
          return {
            ...node,
            x: width / 2 + radius * Math.cos(angle),
            y: height / 2 + radius * Math.sin(angle),
            vx: 0,
            vy: 0,
            radius: node.type === 'note' ? 24 : 20 // slightly larger for notes
          };
        });

        setNodes(initializedNodes);
        setLinks(data.links);
        setError(null);
      } catch (err: any) {
        console.error('Failed to load graph data:', err);
        setError('Failed to query knowledge concept graph edges.');
      } finally {
        setLoading(false);
      }
    }
    fetchGraph();
  }, []);

  // Verlet Integration Physics Loop
  useEffect(() => {
    if (nodes.length === 0) return;

    let animId: number;
    const repulsion = 180;
    const attraction = 0.04;
    const gravity = 0.015;
    const damping = 0.82;
    const targetLength = 120;

    function tick() {
      setNodes((currentNodes) => {
        // Create working copy of nodes
        const nextNodes = currentNodes.map((n) => ({ ...n }));

        // 1. Repulsive forces (All nodes push each other apart)
        for (let i = 0; i < nextNodes.length; i++) {
          const u = nextNodes[i];
          for (let j = i + 1; j < nextNodes.length; j++) {
            const v = nextNodes[j];
            const dx = v.x - u.x || 0.1; // avoid divide by zero
            const dy = v.y - u.y || 0.1;
            const distSq = dx * dx + dy * dy;
            const dist = Math.sqrt(distSq);

            if (dist < 400) {
              const force = repulsion / (distSq + 20);
              const fx = force * (dx / dist);
              const fy = force * (dy / dist);

              // Skip velocity updates for currently dragged node
              if (u.id !== draggedNodeId.current) {
                u.vx -= fx;
                u.vy -= fy;
              }
              if (v.id !== draggedNodeId.current) {
                v.vx += fx;
                v.vy += fy;
              }
            }
          }
        }

        // 2. Attractive link forces (Connected nodes pull each other together)
        links.forEach((link) => {
          const sourceNode = nextNodes.find((n) => n.id === link.source);
          const targetNode = nextNodes.find((n) => n.id === link.target);

          if (sourceNode && targetNode) {
            const dx = targetNode.x - sourceNode.x || 0.1;
            const dy = targetNode.y - sourceNode.y || 0.1;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
            const delta = dist - targetLength;
            const force = delta * attraction;
            const fx = force * (dx / dist);
            const fy = force * (dy / dist);

            if (sourceNode.id !== draggedNodeId.current) {
              sourceNode.vx += fx;
              sourceNode.vy += fy;
            }
            if (targetNode.id !== draggedNodeId.current) {
              targetNode.vx -= fx;
              targetNode.vy -= fy;
            }
          }
        });

        // 3. Gravity and boundary constraints
        nextNodes.forEach((node) => {
          if (node.id === draggedNodeId.current) return;

          // Pull slightly toward center
          node.vx += (width / 2 - node.x) * gravity;
          node.vy += (height / 2 - node.y) * gravity;

          // Apply velocity and damping friction
          node.vx *= damping;
          node.vy *= damping;
          node.x += node.vx;
          node.y += node.vy;

          // Soft viewport constraints
          node.x = Math.max(40, Math.min(width - 40, node.x));
          node.y = Math.max(40, Math.min(height - 40, node.y));
        });

        return nextNodes;
      });

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [links, nodes.length]);

  // Handle Dragging / Panning
  const getMousePos = (e: React.MouseEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    // Translate client mouse positions to SVG viewport coordinates accounting for zoom and pan
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom
    };
  };

  const handleMouseDown = (e: React.MouseEvent, node?: Node) => {
    if (node) {
      // Start node drag
      e.stopPropagation();
      draggedNodeId.current = node.id;
      setSelectedNode(node.id);
    } else {
      // Start viewport pan
      setIsPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNodeId.current) {
      // Update dragged node position directly in mouse coordinates
      const pos = getMousePos(e);
      setNodes((currentNodes) =>
        currentNodes.map((n) =>
          n.id === draggedNodeId.current
            ? { ...n, x: pos.x, y: pos.y, vx: 0, vy: 0 }
            : n
        )
      );
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y
      });
    }
  };

  const handleMouseUp = () => {
    draggedNodeId.current = null;
    setIsPanning(false);
  };

  // Node coloring helpers
  const getNodeColor = (type: string) => {
    switch (type) {
      case 'note': return 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30';
      case 'snippet': return 'text-amber-500 bg-amber-500/10 border-amber-500/30';
      case 'bookmark': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
      case 'idea': return 'text-purple-500 bg-purple-500/10 border-purple-500/30';
      case 'resource': return 'text-rose-500 bg-rose-500/10 border-rose-500/30';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/30';
    }
  };

  const getNodeHex = (type: string) => {
    switch (type) {
      case 'note': return '#6366f1';
      case 'snippet': return '#f59e0b';
      case 'bookmark': return '#10b981';
      case 'idea': return '#a855f7';
      case 'resource': return '#f43f5e';
      default: return '#9ca3af';
    }
  };

  // Highlight check helpers
  const isHighlightedNode = (nodeId: string) => {
    if (!hoveredNode) return true; // default state: everything bright
    if (nodeId === hoveredNode) return true;
    // Check if this node is connected to the hovered node
    return links.some(
      (l) =>
        (l.source === nodeId && l.target === hoveredNode) ||
        (l.source === hoveredNode && l.target === nodeId)
    );
  };

  const isHighlightedLink = (link: Link) => {
    if (!hoveredNode) return true;
    return link.source === hoveredNode || link.target === hoveredNode;
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedNode(null);
  };

  const selectedNodeDetails = nodes.find(n => n.id === selectedNode);
  const activeLinks = links.filter(l => l.source === selectedNode || l.target === selectedNode);

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 overflow-hidden bg-brand-dark p-4 md:p-6 gap-6">
      
      {/* ── Graph Canvas Pane ── */}
      <div className="flex-1 flex flex-col glass-card border border-brand-border/40 rounded-2xl overflow-hidden relative shadow-lg">
        {/* Canvas Toolbar controls */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 bg-brand-card/80 border border-brand-border/40 p-1.5 rounded-xl backdrop-blur-md">
          <button
            onClick={() => setZoom(z => Math.min(2.5, z + 0.15))}
            className="p-2 hover:bg-brand-border/40 text-brand-textMuted hover:text-brand-textMain rounded-lg transition-all"
            title="Zoom In"
          >
            <ZoomIn size={15} />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.4, z - 0.15))}
            className="p-2 hover:bg-brand-border/40 text-brand-textMuted hover:text-brand-textMain rounded-lg transition-all"
            title="Zoom Out"
          >
            <ZoomOut size={15} />
          </button>
          <button
            onClick={resetView}
            className="p-2 hover:bg-brand-border/40 text-brand-textMuted hover:text-brand-textMain rounded-lg transition-all"
            title="Reset Layout View"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10 hidden sm:flex flex-wrap gap-3 bg-brand-card/85 border border-brand-border/30 px-3.5 py-2.5 rounded-xl backdrop-blur-md text-[10px] font-bold">
          <div className="flex items-center gap-1.5 text-indigo-400">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            <span>Notes</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Snippets</span>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Bookmarks</span>
          </div>
          <div className="flex items-center gap-1.5 text-purple-400">
            <span className="h-2 w-2 rounded-full bg-purple-500" />
            <span>Ideas</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span>Resources</span>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-brand-textMuted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mb-3" />
            <p className="text-xs font-semibold">Generating concept graph relations...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center text-brand-textMuted p-6 text-center">
            <Network size={36} className="text-red-500/80 mb-3" />
            <p className="text-sm font-semibold mb-1 text-brand-textMain">{error}</p>
            <p className="text-xs max-w-sm">Ensure your database has the migrations run correctly.</p>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-brand-textMuted p-6 text-center">
            <Network size={36} className="text-brand-accentLight mb-3" />
            <p className="text-sm font-bold mb-1 text-brand-textMain">No concepts to display</p>
            <p className="text-xs max-w-xs">Create multiple developer notes or bookmarks to automatically build your secondary brain's concept graph connections.</p>
          </div>
        ) : (
          <svg
            ref={svgRef}
            className="flex-1 w-full h-full cursor-grab active:cursor-grabbing bg-brand-card/5 select-none"
            viewBox={`0 0 ${width} ${height}`}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseDown={(e) => handleMouseDown(e)}
          >
            {/* Arrowhead marker definitions for directed edges */}
            <defs>
              {['note', 'snippet', 'bookmark', 'idea', 'resource'].map((type) => (
                <marker
                  key={type}
                  id={`arrow-${type}`}
                  viewBox="0 0 10 10"
                  refX="33" // pull arrow tip back slightly from node center circle
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill={getNodeHex(type)} opacity="0.7" />
                </marker>
              ))}
            </defs>

            {/* Transformable container group representing panning and zoom scaling */}
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              
              {/* ── Render Links/Edges ── */}
              <g>
                {links.map((link) => {
                  const sourceNode = nodes.find((n) => n.id === link.source);
                  const targetNode = nodes.find((n) => n.id === link.target);
                  if (!sourceNode || !targetNode) return null;

                  const highlighted = isHighlightedLink(link);

                  return (
                    <g key={link.id} className="transition-opacity duration-300">
                      {/* Interactive wider line wrapper to ease hovering */}
                      <line
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        stroke="transparent"
                        strokeWidth={15}
                        className="cursor-pointer"
                        onMouseEnter={() => {
                          setHoveredNode(sourceNode.id);
                        }}
                        onMouseLeave={() => setHoveredNode(null)}
                      />
                      {/* Actual visible edge line */}
                      <line
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        stroke={getNodeHex(targetNode.type)}
                        strokeWidth={highlighted ? 2.5 : 1}
                        strokeDasharray={link.type === 'alternative_to' ? '4,4' : undefined}
                        markerEnd={`url(#arrow-${targetNode.type})`}
                        className="transition-all duration-200"
                        opacity={highlighted ? 0.75 : 0.15}
                      />
                    </g>
                  );
                })}
              </g>

              {/* ── Render Nodes ── */}
              <g>
                {nodes.map((node) => {
                  const highlighted = isHighlightedNode(node.id);
                  const selected = selectedNode === node.id;

                  return (
                    <g
                      key={node.id}
                      className="cursor-pointer transition-opacity duration-300"
                      transform={`translate(${node.x}, ${node.y})`}
                      onMouseDown={(e) => handleMouseDown(e, node)}
                      onMouseEnter={() => setHoveredNode(node.id)}
                      onMouseLeave={() => setHoveredNode(null)}
                      opacity={highlighted ? 1 : 0.25}
                    >
                      {/* Glow backing shadow for hovered/selected nodes */}
                      {(selected || hoveredNode === node.id) && (
                        <circle
                          r={node.radius + 8}
                          fill="none"
                          stroke={getNodeHex(node.type)}
                          strokeWidth={1.5}
                          strokeDasharray="3,3"
                          className="animate-spin"
                          style={{ transformOrigin: 'center', animationDuration: '8s' }}
                        />
                      )}
                      
                      {/* Outer boundary circle */}
                      <circle
                        r={node.radius}
                        fill="#0b0f19"
                        stroke={selected ? '#ffffff' : getNodeHex(node.type)}
                        strokeWidth={selected ? 3 : 2}
                        className="transition-all duration-150 shadow-md"
                        style={{
                          filter: selected ? `drop-shadow(0 0 8px ${getNodeHex(node.type)})` : undefined
                        }}
                      />

                      {/* Title Text Badge */}
                      <text
                        textAnchor="middle"
                        y={node.radius + 15}
                        fill={selected ? '#ffffff' : '#9ca3af'}
                        className={`text-[9px] font-bold tracking-tight transition-colors pointer-events-none select-none`}
                        style={{ maxWidth: 80 }}
                      >
                        {node.title.length > 14 ? `${node.title.slice(0, 12)}...` : node.title}
                      </text>

                      {/* Small Type abbreviation letter in circle center */}
                      <text
                        textAnchor="middle"
                        y={4}
                        fill={getNodeHex(node.type)}
                        className="text-[9px] font-black uppercase pointer-events-none select-none"
                      >
                        {node.type.slice(0, 3)}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>
        )}
      </div>

      {/* ── Relationship Detail Pane ── */}
      <div className="w-full md:w-80 shrink-0 flex flex-col gap-5 glass-card border border-brand-border/40 p-5 rounded-2xl bg-brand-card/10">
        <div className="flex items-center gap-2 border-b border-brand-border/40 pb-3">
          <Network size={18} className="text-brand-accentLight" />
          <h3 className="font-bold text-sm text-brand-textMain">Graph Inspector</h3>
        </div>

        {selectedNodeDetails ? (
          <div className="flex-1 flex flex-col gap-4 animate-in fade-in duration-300 min-h-0 overflow-hidden">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${getNodeColor(selectedNodeDetails.type)}`}>
                  {selectedNodeDetails.type}
                </span>
              </div>
              <h4 className="font-extrabold text-base text-brand-textMain leading-snug">
                {selectedNodeDetails.title}
              </h4>
            </div>

            {/* Links / Connections list */}
            <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto pr-1">
              <span className="text-[10px] uppercase tracking-wider text-brand-textMuted font-bold">
                Semantic Relations ({activeLinks.length})
              </span>
              {activeLinks.length === 0 ? (
                <div className="flex items-center gap-1.5 p-3 rounded-xl border border-brand-border/20 bg-brand-card/5 text-xs text-brand-textMuted font-medium">
                  <Info size={13} />
                  <span>No relationships computed for this save.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {activeLinks.map((link) => {
                    const isSource = link.source === selectedNode;
                    const otherId = isSource ? link.target : link.source;
                    const otherNode = nodes.find(n => n.id === otherId);

                    return (
                      <div
                        key={link.id}
                        onClick={() => setSelectedNode(otherId)}
                        className="p-3 bg-brand-card/50 hover:bg-brand-card border border-brand-border/40 hover:border-brand-border rounded-xl cursor-pointer transition-all flex flex-col gap-1 text-left"
                      >
                        <div className="flex items-center justify-between text-[9px] font-bold text-brand-textMuted">
                          <span className="flex items-center gap-1">
                            <Link2 size={10} />
                            <span className="capitalize">{link.type.replace('_', ' ')}</span>
                          </span>
                          <span>{isSource ? 'Outgoing ➔' : 'Incoming ↵'}</span>
                        </div>
                        <span className="text-xs font-semibold text-brand-textMain truncate">
                          {otherNode?.title || 'Unknown Note'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Action buttons */}
            {onViewEntry && (
              <button
                onClick={() => onViewEntry(selectedNodeDetails.id)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md mt-auto shrink-0 select-none"
              >
                Inspect Entry Details
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 text-brand-textMuted my-auto">
            <Info size={24} className="mb-2 text-brand-textMuted/60" />
            <p className="text-xs leading-relaxed font-semibold">
              Click on a concept node in the network to inspect its connections and details.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
