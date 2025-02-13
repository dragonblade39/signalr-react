import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { HubConnectionBuilder } from "@microsoft/signalr";
import "./Navbar.css";
import "bootstrap-icons/font/bootstrap-icons.css";

const API_URL = "https://localhost:7068/api/TreeNodes";
const CACHE_EXPIRY_MS = 60000;

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
  const [treeData, setTreeData] = useState([]);
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [expanded, setExpanded] = useState({});
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [isNavbarOpen, setIsNavbarOpen] = useState(window.innerWidth > 425);
  const navbarRef = useRef(null);

  const buildTree = (flatArray) => {
    const map = new Map();
    const roots = [];
    
    flatArray.forEach((node) => {
      // Ensure a fresh node copy with default properties
      const newNode = { ...node, children: [], hasChildren: false, childrenLoaded: false };
      map.set(node.id, newNode);
    });
    
    flatArray.forEach((node) => {
      const currentNode = map.get(node.id);
      if (node.parentId === null || node.parentId === 0) {
        roots.push(currentNode);
      } else {
        const parent = map.get(node.parentId);
        if (parent) {
          parent.children.push(currentNode);
          parent.hasChildren = true; // Mark the parent as having children
        }
      }
    });
  
    // Return the roots with their expandability set
    return roots;
  };
  
  

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

  const updateNodeChildren = (nodes, nodeId, children) => {
    return nodes.map((node) => {
      if (node.id === nodeId) {
        return { 
          ...node, 
          children: children, 
          childrenLoaded: true,
          hasChildren: children.length > 0 
        };
      }
      if (node.children && node.children.length > 0) {
        return { ...node, children: updateNodeChildren(node.children, nodeId, children) };
      }
      return node;
    });
  };

  // Fetch top-level nodes and initialize tree state
  const fetchTopLevelNodes = async () => {
    try {
      const cacheKey = "topLevelNodes";
      const cachedData = getCache(cacheKey);
      
      // Check for cached data
      if (cachedData) {
        const tree = buildTree(cachedData);
        setTreeData(tree);
        setNodeStatuses((prev) => {
          const updated = { ...prev };
          cachedData.forEach((node) => {
            updated[node.id] = node.isActive;
          });
          return updated;
        });
      }
  
      // If no cached data, fetch from API
      const response = await axios.get(API_URL);
      if (response.data) {
        const tree = buildTree(response.data);
        setTreeData(tree);
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

  const fetchChildren = async (nodeId) => {
    try {
      const cacheKey = `children_${nodeId}`;
      const cachedData = getCache(cacheKey);
      if (cachedData) {
        console.log(`Fetched children from cache for node ${nodeId}`, cachedData);
        setTreeData((prevTree) => updateNodeChildren(prevTree, nodeId, cachedData));
        setNodeStatuses((prev) => {
          const updated = { ...prev };
          cachedData.forEach((child) => {
            updated[child.id] = child.isActive;
          });
          return updated;
        });
      } else {
        console.log(`No cached data for node ${nodeId}, fetching from backend...`);
        const response = await axios.get(`${API_URL}/children/${nodeId}`);
        if (response.data) {
          console.log(`Fetched children from backend for node ${nodeId}`, response.data);
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
      }
    } catch (error) {
      console.error(`Error fetching children for node ${nodeId}:`, error);
    }
  };

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
            // Flatten the existing tree
            const flat = flattenTree(prevTree);
            const updatedFlat = flat.map((node) => 
              node.id === newTreeNode.id 
                ? { ...node, ...newTreeNode, childrenLoaded: true } 
                : node
            );
  
            // Check if the node has children based on the received node's data
            const hasChildren = newTreeNode.children && newTreeNode.children.length > 0;
            updatedFlat.push({ ...newTreeNode, hasChildren });
  
            // Rebuild and return the tree
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
    const intervalId = setInterval(fetchTopLevelNodes, 500);
    return () => {
      connection.stop();
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setIsNavbarOpen(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleToggle = async (node, siblings) => {
    // Determine whether this node is expandable using its properties
    let isExpandable = node.hasChildren 
    ?? (!node.childrenLoaded || 
    (node.children && node.children.length > 0));
  
    if (!isExpandable) {
      setActiveNodeId(node.id);
      return;
    }
  
    setExpanded((prev) => {
      const newExpanded = { ...prev };
      if (prev[node.id]) {
        const descendantNodes = flattenTree([node]);
        descendantNodes.forEach((n) => {
          delete newExpanded[n.id];
        });
      } else {
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
  
    if (!node.childrenLoaded) {
      await fetchChildren(node.id);
    }
  };

  const renderTree = (node, siblings, level = 0) => {
    const isExpandable = node.children && node.children.length > 0;
  
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
          <span className="status-indicator">
            <i className={`bi bi-circle-fill ${nodeStatuses[node.id] ? "active-icon" : "inactive-icon"}`}></i>
          </span>&nbsp;
          <span className="node-title" onClick={() => handleToggle(node, siblings)}>
            {node.label}
          </span>
        </div>
        {isExpanded && (
          node.children && node.children.length > 0 ? (
            <div className="node-children">
              {node.children.map((child) => renderTree(child, node.children, level + 1))}
            </div>
          ) : node.childrenLoaded ? null : (
            <div className="node-children loading">Loading...</div>
          )
        )}
      </div>
    );
  };

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
      {/* <div className="active-status-container">
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
      )} */}
    </div>
  );
};

export default Navbar;