import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { HubConnectionBuilder } from "@microsoft/signalr";
import "./Navbar.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import Component1 from "../Component1/Component1";

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

const getVisibleNodeIds = (nodes, expandedState) => {
  let visibleIds = [];
  nodes.forEach((node) => {
    visibleIds.push(node.id);
    if (expandedState[node.id] && node.children && node.children.length > 0) {
      visibleIds = visibleIds.concat(
        getVisibleNodeIds(node.children, expandedState)
      );
    }
  });
  return visibleIds;
};

const Navbar = () => {
  const [treeData, setTreeData] = useState([]);
  const [nodeStatuses, setNodeStatuses] = useState({});
  const [expanded, setExpanded] = useState({});
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [isNavbarOpen, setIsNavbarOpen] = useState(window.innerWidth > 425);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [remainingTimes, setRemainingTimes] = useState({});
  const [showComponent1, setShowComponent1] = useState(false);

  const navbarRef = useRef(null);
  const notificationRef = useRef(null);
  const prevNodeStatusesRef = useRef({});

  const formatISTTime = (date) => {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "numeric",
    }).format(date);
  };

  const addNotification = (notification) => {
    const notificationId = Date.now();
    const timeStamp = formatISTTime(new Date());
    setNotifications((prev) => [
      ...prev,
      { id: notificationId, ...notification, timeStamp },
    ]);
    setRemainingTimes((prev) => ({ ...prev, [notificationId]: 30 }));
  };

  useEffect(() => {
    const timerId = setInterval(() => {
      setRemainingTimes((prev) => {
        const updated = { ...prev };
        let removeIds = [];
        Object.keys(updated).forEach((id) => {
          if (updated[id] > 0) {
            updated[id] -= 1;
          }
          if (updated[id] === 0) {
            removeIds.push(Number(id));
          }
        });
        if (removeIds.length > 0) {
          setNotifications((prevNotifs) =>
            prevNotifs.filter((n) => !removeIds.includes(n.id))
          );
          removeIds.forEach((id) => {
            delete updated[id];
          });
        }
        return updated;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, []);

  useEffect(() => {
    if (!showNotifications) {
      setNotifications([]);
      setRemainingTimes({});
    }
  }, [showNotifications]);

  const buildTree = (flatArray) => {
    const map = new Map();
    const roots = [];

    flatArray.forEach((node) => {
      const newNode = {
        ...node,
        children: [],
        hasChildren: false,
        childrenLoaded: false,
      };
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
          parent.hasChildren = true;
        }
      }
    });

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
          hasChildren: children.length > 0,
        };
      }
      if (node.children && node.children.length > 0) {
        return {
          ...node,
          children: updateNodeChildren(node.children, nodeId, children),
        };
      }
      return node;
    });
  };

  const fetchTopLevelNodes = async () => {
    try {
      const cacheKey = "topLevelNodes";
      const cachedData = getCache(cacheKey);

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
        setTreeData((prevTree) =>
          updateNodeChildren(prevTree, nodeId, cachedData)
        );
        setNodeStatuses((prev) => {
          const updated = { ...prev };
          cachedData.forEach((child) => {
            updated[child.id] = child.isActive;
          });
          return updated;
        });
      } else {
        const response = await axios.get(`${API_URL}/children/${nodeId}`);
        if (response.data) {
          setTreeData((prevTree) =>
            updateNodeChildren(prevTree, nodeId, response.data)
          );
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
            const flat = flattenTree(prevTree);
            const updatedFlat = flat.map((node) =>
              node.id === newTreeNode.id
                ? { ...node, ...newTreeNode, childrenLoaded: true }
                : node
            );

            const hasChildren =
              newTreeNode.children && newTreeNode.children.length > 0;
            updatedFlat.push({ ...newTreeNode, hasChildren });

            return buildTree(updatedFlat);
          });

          setNodeStatuses((prev) => ({
            ...prev,
            [newTreeNode.id]: newTreeNode.isActive,
          }));
        });
      })
      .catch((err) =>
        console.error("Error while starting SignalR connection: " + err)
      );

    fetchTopLevelNodes();
    const intervalId = setInterval(fetchTopLevelNodes, 500);
    return () => {
      connection.stop();
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setIsNavbarOpen(true);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleToggle = async (node, siblings) => {
    const isExpandable =
      node.hasChildren ??
      (!node.childrenLoaded || (node.children && node.children.length > 0));
    if (!isExpandable) {
      setActiveNodeId(node.id);
      return;
    }

    setExpanded((prev) => {
      const newExpanded = { ...prev };
      if (prev[node.id]) {
        const descendantNodes = flattenTree([node]);
        descendantNodes.forEach((n) => delete newExpanded[n.id]);
      } else {
        siblings.forEach((sibling) => {
          if (sibling.id !== node.id) {
            const descendantNodes = flattenTree([sibling]);
            descendantNodes.forEach((n) => delete newExpanded[n.id]);
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

  const handleDoubleClick = (node) => {
    setShowComponent1(true);
  };
  const renderTree = (node, siblings, level = 0) => {
    const isExpandable = node.children && node.children.length > 0;
    const isExpanded = expanded[node.id];

    let statusClass = "neutral-icon";
    const status = nodeStatuses[node.id];
    if (status === 1) {
      statusClass = "inactive-icon";
    } else if (status === 2) {
      statusClass = "active-icon";
    }

    return (
      <div key={node.id} className={`tree-node level-${level}`}>
        <div
          className={`node-header node-label ${
            isExpanded ? "expanded-node" : ""
          }`}
        >
          {isExpandable && (
            <span
              className="arrow"
              onClick={() => handleToggle(node, siblings)}
            >
              {isExpanded ? (
                <i className="bi bi-arrow-down-circle-fill"></i>
              ) : (
                <i className="bi bi-arrow-right-circle"></i>
              )}
            </span>
          )}
          <span className="status-indicator">
            <i className={`bi bi-circle-fill ${statusClass}`}></i>
          </span>
           
          <span
            className="node-title"
            onDoubleClick={() => handleDoubleClick(node)}
          >
            {node.label}
          </span>
        </div>
        {isExpanded &&
          (node.children && node.children.length > 0 ? (
            <div className="node-children">
              {node.children.map((child) => (
                <div key={child.id} className="child-wrapper">
                  {renderTree(child, node.children, level + 1)}
                </div>
              ))}
            </div>
          ) : node.childrenLoaded ? null : (
            <div className="node-children loading">Loading...</div>
          ))}
      </div>
    );
  };

  const renderMessage = (nodeLabel, newStatus) => {
    const messageStyle = { color: newStatus === "idle" ? "black" : "inherit" };
    return (
      <span style={messageStyle}>
        <strong>{nodeLabel}</strong> is {newStatus} now.
      </span>
    );
  };

  useEffect(() => {
    const visibleIdsSet = new Set(getVisibleNodeIds(treeData, expanded));
    const prev = prevNodeStatusesRef.current;
    Object.entries(nodeStatuses).forEach(([id, newStatus]) => {
      if (
        prev[id] !== undefined &&
        prev[id] !== newStatus &&
        visibleIdsSet.has(Number(id))
      ) {
        const node = findNodeById(treeData, Number(id)) || {};
        let newStatusText = "";
        if (newStatus === 0) {
          newStatusText = "idle";
        } else if (newStatus === 1) {
          newStatusText = "inactive";
        } else if (newStatus === 2) {
          newStatusText = "active";
        } else {
          newStatusText = "unknown";
        }
        addNotification({
          id,
          message: renderMessage(node.label, newStatusText),
          type:
            newStatus === 2 ? "active" : newStatus === 1 ? "inactive" : "idle",
        });
      }
    });
    prevNodeStatusesRef.current = nodeStatuses;
  }, [nodeStatuses, treeData, expanded]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target)
      ) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <button
        className="navbar-toggle"
        onClick={() => setIsNavbarOpen(!isNavbarOpen)}
      >
        {isNavbarOpen ? (
          <i className="bi bi-arrow-left-circle"></i>
        ) : (
          <i className="bi bi-arrow-right-circle"></i>
        )}
      </button>

      <div
        className={`left-navbar ${isNavbarOpen ? "open" : "closed"}`}
        ref={navbarRef}
      >
        {treeData.length > 0 ? (
          treeData.map((node) => renderTree(node, treeData))
        ) : (
          <p>Loading data...</p>
        )}
      </div>

      <div
        className="notification-bell"
        onClick={() => setShowNotifications((prev) => !prev)}
      >
        <i className="bi bi-bell-fill"></i>
        {notifications.length > 0 && <span className="notification-dot"></span>}
      </div>
      <div>
        {showNotifications && (
          <div className="notification-dropdown" ref={notificationRef}>
            {notifications.length > 0 ? (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notification-item ${notif.type}`}
                >
                  {notif.message}
                  <div className="notification-timer">{notif.timeStamp}</div>
                </div>
              ))
            ) : (
              <p className="no-notifications">No new notifications</p>
            )}
          </div>
        )}
      </div>
      {showComponent1 && (
        <Component1 onClose={() => setShowComponent1(false)} />
      )}
    </div>
  );
};

export default Navbar;
