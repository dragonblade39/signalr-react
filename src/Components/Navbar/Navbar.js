import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { HubConnectionBuilder } from "@microsoft/signalr";
import "./Navbar.css";
import "bootstrap-icons/font/bootstrap-icons.css";

// Base API URL and cache expiry time (in milliseconds)
const API_URL = "https://localhost:7068/api/TreeNodes";
const CACHE_EXPIRY_MS = 60000;

// --- Cache Helper Functions ---
const getCache = (key) => {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    if (Date.now() - parsed.timestamp < CACHE_EXPIRY_MS) {
      return parsed.data;
    } else {
      localStorage.removeItem(key);
      return null;
    }
  } catch (e) {
    localStorage.removeItem(key);
    return null;
  }
};

const setCache = (key, data) => {
  const value = { timestamp: Date.now(), data };
  localStorage.setItem(key, JSON.stringify(value));
};

const Navbar = () => {
  // State variables
  const [treeData, setTreeData] = useState([]);
  const [nodeStatuses, setNodeStatuses] = useState({}); // { [nodeId]: boolean }
  const [expanded, setExpanded] = useState({});
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [isNavbarOpen, setIsNavbarOpen] = useState(window.innerWidth > 425);
  const navbarRef = useRef(null);

  // --- Helper: Build a tree from a flat array of nodes ---
  const buildTree = (flatArray) => {
    const map = new Map();
    const roots = [];
    flatArray.forEach((node) => {
      // Create a fresh copy and ensure a children array exists.
      map.set(node.id, { ...node, children: [] });
    });
    flatArray.forEach((node) => {
      const currentNode = map.get(node.id);
      if (node.parentId === null || node.parentId === 0) {
        roots.push(currentNode);
      } else {
        const parent = map.get(node.parentId);
        if (parent) {
          parent.children.push(currentNode);
        }
      }
    });
    return roots;
  };

  // --- Helper: Flatten the tree into an array ---
  const flattenTree = (nodes) => {
    let list = [];
    nodes.forEach((node) => {
      list.push(node);
      if (node.children && node.children.length > 0) {
        list = list.concat(flattenTree(node.children));
      }
    });
    return list;
  };

  // --- Helper: Find a node by its id in the tree ---
  const findNodeById = (nodes, id) => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children && node.children.length > 0) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  // --- Helper: Update a node’s children in the tree ---
  // Also mark the node as having been loaded and update its "hasChildren" flag
  const updateNodeChildren = (nodes, nodeId, children) => {
    return nodes.map((node) => {
      if (node.id === nodeId) {
        return { 
          ...node, 
          children: children, 
          childrenLoaded: true,
          // Update hasChildren based on the fetched children.
          hasChildren: children.length > 0 
        };
      }
      if (node.children && node.children.length > 0) {
        return { ...node, children: updateNodeChildren(node.children, nodeId, children) };
      }
      return node;
    });
  };

  // --- Fetch Top-Level Nodes with Caching ---
  const fetchTopLevelNodes = async () => {
    try {
      const cacheKey = "topLevelNodes";
      const cachedData = getCache(cacheKey);
      if (cachedData) {
        setTreeData(buildTree(cachedData));
        setNodeStatuses((prev) => {
          const updated = { ...prev };
          cachedData.forEach((node) => {
            updated[node.id] = node.isActive;
          });
          return updated;
        });
      }
      const response = await axios.get(API_URL);
      if (response.data) {
        setTreeData(buildTree(response.data));
        setNodeStatuses((prev) => {
          const updated = { ...prev };
          response.data.forEach((node) => {
            updated[node.id] = node.isActive;
          });
          return updated;
        });
        setCache(cacheKey, response.data);
      }
    } catch (error) {
      console.error("Error fetching top-level nodes:", error);
    }
  };

  // --- Fetch Children for a Given Node (Lazy Loading with Caching) ---
  const fetchChildren = async (nodeId) => {
    try {
      const cacheKey = `children_${nodeId}`;
      const cachedData = getCache(cacheKey);
      if (cachedData) {
        setTreeData((prevTree) => updateNodeChildren(prevTree, nodeId, cachedData));
        setNodeStatuses((prev) => {
          const updated = { ...prev };
          cachedData.forEach((child) => {
            updated[child.id] = child.isActive;
          });
          return updated;
        });
      }
      const response = await axios.get(`${API_URL}/children/${nodeId}`);
      if (response.data) {
        setTreeData((prevTree) => updateNodeChildren(prevTree, nodeId, response.data));
        setNodeStatuses((prev) => {
          const updated = { ...prev };
          response.data.forEach((child) => {
            updated[child.id] = child.isActive;
          });
          return updated;
        });
        setCache(cacheKey, response.data);
      }
    } catch (error) {
      console.error(`Error fetching children for node ${nodeId}:`, error);
    }
  };

  // --- SignalR Setup & Periodic Refresh ---
  useEffect(() => {
    const connection = new HubConnectionBuilder()
      .withUrl("https://localhost:7068/treeNodeHub", { withCredentials: true })
      .build();

    connection
      .start()
      .then(() => {
        console.log("Connected to SignalR hub");
        connection.on("ReceiveTreeNode", (newTreeNode) => {
          setTreeData((prevTree) => {
            const flat = flattenTree(prevTree);
            const exists = flat.some((node) => node.id === newTreeNode.id);
            let updatedFlat;
            if (exists) {
              // Merge new data into the existing node.
              updatedFlat = flat.map((node) =>
                node.id === newTreeNode.id ? { ...node, ...newTreeNode } : node
              );
            } else {
              updatedFlat = [...flat, newTreeNode];
            }
            return buildTree(updatedFlat);
          });
          setNodeStatuses((prev) => ({
            ...prev,
            [newTreeNode.id]: newTreeNode.isActive,
          }));
          console.log("SignalR - node received/updated:", newTreeNode);
        });
      })
      .catch((err) => console.error("Error while starting SignalR connection: " + err));

    fetchTopLevelNodes();
    const intervalId = setInterval(fetchTopLevelNodes, 2000);
    return () => {
      connection.stop();
      clearInterval(intervalId);
    };
  }, []);

  // --- Handle Window Resize ---
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsNavbarOpen(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- Toggle Node Expansion (Collapse Other Branches) ---
  const handleToggle = async (node, siblings) => {
    // Determine whether this node is expandable.
    // If the API explicitly tells you it has children, or if no explicit flag exists then:
    // - If children haven't been loaded yet, assume it might be expandable.
    // - If children are loaded, check if the children array is non-empty.
    let isExpandable = false;
    if (node.hasChildren === true) {
      isExpandable = true;
    } else if (node.hasChildren === false) {
      isExpandable = false;
    } else {
      isExpandable = !node.childrenLoaded || (node.children && node.children.length > 0);
    }

    // If not expandable, just set it as the active node.
    if (!isExpandable) {
      setActiveNodeId(node.id);
      return;
    }

    // Toggle expansion state (and collapse sibling branches)
    setExpanded((prev) => {
      const newExpanded = { ...prev };
      if (prev[node.id]) {
        // Collapse this branch.
        const descendantNodes = flattenTree([node]);
        descendantNodes.forEach((n) => {
          delete newExpanded[n.id];
        });
      } else {
        // Collapse other sibling branches.
        siblings.forEach((sibling) => {
          if (sibling.id !== node.id) {
            const descendantNodes = flattenTree([sibling]);
            descendantNodes.forEach((n) => {
              delete newExpanded[n.id];
            });
          }
        });
        newExpanded[node.id] = true;
      }
      return newExpanded;
    });
    setActiveNodeId(node.id);

    // If children haven't been loaded, fetch them.
    if (!node.childrenLoaded) {
      await fetchChildren(node.id);
    }
  };

  // --- Render the Navigation Tree ---
  const renderTree = (node, siblings, level = 0) => {
    // Determine expandability using the same logic as in handleToggle.
    const isExpandable = node.hasChildren === true
      ? true
      : node.hasChildren === false
        ? false
        : (!node.childrenLoaded || (node.children && node.children.length > 0));

    const isExpanded = expanded[node.id];

    return (
      <div key={node.id} className={`tree-node level-${level}`}>
        <div className="node-header node-label">
          {isExpandable && (
            <span className="arrow" onClick={() => handleToggle(node, siblings)}>
              {isExpanded ? (
                <i className="bi bi-arrow-down-circle-fill"></i>
              ) : (
                <i className="bi bi-arrow-right-circle"></i>
              )}
            </span>
          )}
          <span className="node-title" onClick={() => handleToggle(node, siblings)}>
            {node.label}
          </span>
        </div>
        {isExpanded &&
          (node.children && node.children.length > 0 ? (
            <div className="node-children">
              {node.children.map((child) => renderTree(child, node.children, level + 1))}
            </div>
          ) : node.childrenLoaded ? null : (
            <div className="node-children loading">Loading...</div>
          ))}
      </div>
    );
  };

  // --- Render the Modal's Status View (Only First-Level Children) ---
  const renderModalStatus = () => {
    const activeNode = activeNodeId ? findNodeById(treeData, activeNodeId) : null;
    if (!activeNode || !activeNode.children || activeNode.children.length === 0) {
      return <p>No child statuses available</p>;
    }
    return (
      <ul className="status-tree">
        {activeNode.children.map((child) => (
          <li key={child.id} className="status-tree-item">
            <i className="bi bi-caret-right-fill tree-icon"></i>
            <span className="node-label">{child.label}</span>
            <span className="status-indicator">
              <i className={`bi bi-circle-fill ${nodeStatuses[child.id] ? "active-icon" : "inactive-icon"}`}></i>
            </span>
          </li>
        ))}
      </ul>
    );
  };

  const activeNode = activeNodeId ? findNodeById(treeData, activeNodeId) : null;

  return (
    <div style={{ position: "relative" }}>
      <button className="navbar-toggle" onClick={() => setIsNavbarOpen(!isNavbarOpen)}>
        {isNavbarOpen ? (
          <i className="bi bi-arrow-left-circle"></i>
        ) : (
          <i className="bi bi-arrow-right-circle"></i>
        )}
      </button>
      <div className={`left-navbar ${isNavbarOpen ? "open" : "closed"}`} ref={navbarRef}>
        {treeData.length > 0 ? treeData.map((node) => renderTree(node, treeData)) : <p>Loading data...</p>}
      </div>
      <div className="active-status-container">
        <h4>Active Node Status</h4>
        {activeNode ? (
          <p>
            Node: {activeNode.label}{" "}
            <span className="status-indicator">
              <i className={`bi bi-circle-fill ${nodeStatuses[activeNode.id] ? "active-icon" : "inactive-icon"}`}></i>
            </span>
          </p>
        ) : (
          <p>No node selected</p>
        )}
        {activeNode && activeNode.children && activeNode.children.length > 0 && (
          <button className="status-modal-button" onClick={() => setShowStatusModal(true)}>
            <i className="bi bi-info-circle"></i> Show Child Statuses
          </button>
        )}
      </div>
      {showStatusModal && (
        <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Child Statuses</h4>
              <button className="modal-close" onClick={() => setShowStatusModal(false)}>
                <i className="bi bi-x-circle"></i>
              </button>
            </div>
            <div className="modal-body">{renderModalStatus()}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Navbar;