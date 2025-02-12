import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./Navbar.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { HubConnectionBuilder } from "@microsoft/signalr";

const API_URL = "https://localhost:7068/api/TreeNodes";

const randomBoolean = () => Math.random() < 0.5;

const addIsActiveField = (nodes) => {
    console.log(nodes);
  return nodes.map((node) => {
    return {
      ...node,
      isActive: randomBoolean(),
      children: node.children ? addIsActiveField(node.children) : null,
    };
  });
};

const Navbar = () => {
  const [expanded, setExpanded] = useState({});
  const [treeData, setTreeData] = useState([]);
  const [previousNode, setPreviousNode] = useState(null);
  const [isNavbarOpen, setIsNavbarOpen] = useState(window.innerWidth > 425);
  const [activeNode, setActiveNode] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const navbarRef = useRef(null);

  useEffect(() => {
    // Create the SignalR connection
    const connection = new HubConnectionBuilder()
      .withUrl("https://localhost:7068/treeNodeHub", { withCredentials: true })
      .build();

    // Define the data fetching function
    const fetchData = async () => {
      try {
        const response = await axios.get(API_URL);
        if (response.data) {
          const updatedData = addIsActiveField(buildTree(response.data));
        //   setTreeData(updatedData);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    useEffect(() => {
        if (connection) {
            if (previousNode) {
                connection.invoke('LeaveNodeGroupAsync', previousNode)
                    .catch((err) => console.error('Error leaving city group:', err));
            }
            if (city) {          
                connection.invoke('JoinNodeGroupAsync', node)
                    //.then(() => fetchWeather(node))
                    .catch((err) => console.error('Error joining city group:', err));
                setPreviousNode(node);
            }
        }
    }, [node, connection]);

    // Start the SignalR connection and listen for updates
    connection
      .start()
      .then(() => {
        console.log("Connected to SignalR hub");

        connection.on("ReceiveTreeNode", (newTreeNode) => {
          setTreeData((prevNodes) => {
            const updatedNodes = updateTreeData(prevNodes, newTreeNode);
            console.log(newTreeNode);
            return addIsActiveField(updatedNodes);
          });
          console.log("New TreeNode added:", newTreeNode);
        });
      })
      .catch((err) => console.error("Error while starting connection: " + err));

    // Immediately fetch data on mount...
    fetchData();
    // ...and set an interval to fetch data every 1 second.
    const intervalId = setInterval(fetchData, 5000);

    // Cleanup both the SignalR connection and the interval on unmount.
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

  // Build a tree structure from a flat array
  const buildTree = (flatArray) => {
    const map = new Map();
    const roots = [];
    flatArray.forEach((node) => {
      map.set(node.id, { ...node, children: [] });
    });
    flatArray.forEach((node) => {
      if (node.parentId === null || node.parentId === 0) {
        roots.push(map.get(node.id));
      } else {
        const parent = map.get(node.parentId);
        if (parent) {
          parent.children.push(map.get(node.id));
        }
      }
    });
    return roots;
  };

  // Update the tree data with a new or updated node
  const updateTreeData = (existingNodes, newNode) => {
    const nodesMap = new Map();
    existingNodes.forEach((node) => {
      nodesMap.set(node.id, node);
    });

    if (nodesMap.has(newNode.id)) {
      nodesMap.set(newNode.id, { ...nodesMap.get(newNode.id), ...newNode });
    } else {
      nodesMap.set(newNode.id, newNode);
    }

    const mergedTree = buildTree(Array.from(nodesMap.values()));
    return mergedTree;
  };

  const handleToggle = (node, siblings) => {
    setExpanded((prev) => {
      const newExpanded = { ...prev };
      if (newExpanded[node.id]) {
        delete newExpanded[node.id];
      } else {
        siblings.forEach((sibling) => {
          if (sibling.id !== node.id && newExpanded[sibling.id]) {
            delete newExpanded[sibling.id];
          }
        });
        newExpanded[node.id] = true;
      }
      return newExpanded;
    });
    setActiveNode(node);
  };

  const renderTree = (node, siblings, level = 0) => {
    const isExpanded = expanded[node.id];
    return (
      <div key={node.id} className={`tree-node level-${level}`}>
        <div className={`node-header node-label ${isExpanded ? "expanded-node" : ""}`}>
          {node.children && node.children.length > 0 && (
            <span className="arrow" onClick={() => handleToggle(node, siblings)}>
              {isExpanded ? (
                <i className="bi bi-arrow-down-circle-fill"></i>
              ) : (
                <i className="bi bi-arrow-right-circle"></i>
              )}
            </span>
          )}
          <span className="node-title">{node.label}</span>
        </div>
        {node.children && isExpanded && (
          <div className="node-children">
            {node.children.map((child) => renderTree(child, node.children, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderStatusTree = (node, level = 0) => {
    return (
      <div key={node.id} className="status-tree-node" style={{ marginLeft: `${level * 20}px` }}>
        <span className="status-node-label">{node.label}</span>{" "}
        <span className="status-indicator">
          <i className={`bi bi-circle-fill ${node.isActive ? "active-icon" : "inactive-icon"}`}></i>
        </span>
        {node.children && node.children.length > 0 && (
          <div className="status-tree-children">
            {node.children.map((child) => renderStatusTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

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
              <i className={`bi bi-circle-fill ${activeNode.isActive ? "active-icon" : "inactive-icon"}`}></i>
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
            <div className="modal-body">
              {activeNode && activeNode.children && activeNode.children.length > 0 ? (
                activeNode.children.map((child) => renderStatusTree(child))
              ) : (
                <p>No child statuses available</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Navbar;