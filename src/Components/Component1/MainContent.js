import React, { useEffect, useState } from "react";
import "./Component1.css"; // Ensure this path matches your file structure

function MainContent({ url }) { // Destructure url from props
  const [jsonData, setJsonData] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      let fetchUrl;

      // Set URL based on input value
      if (url === "1") {
        fetchUrl = "MainViewContent.json"; // Replace this with the actual URL for option "1"
      } else if (url === "2") {
        fetchUrl = "ParamMainViewContent.json"; // Replace this with the actual URL for option "2"
      } else {
        setError("Invalid URL option");
        setLoading(false);
        return;
      }

      try {
        console.log(`Fetching data from: ${fetchUrl}`); // Debug log
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setJsonData(data);
        console.log("Fetched data:", data); // Debug log
      } catch (error) {
        console.error("Error fetching data:", error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]); // Listen for changes in url prop

  const renderField = (field, index, isFirstInSection = false) => {
    if (isFirstInSection && field.label && Object.keys(field).length === 1) {
      return (
        <h3 key={index} className="MainContent__section-heading">
          {field.label}
        </h3>
      );
    }

    if (!isFirstInSection && field.label && Object.keys(field).length === 1) {
      return (
        <p key={index} className="MainContent__inline-label">
          {field.label}
        </p>
      );
    }

    return (
      <div key={index} className="MainContent__field-box">
        <label>{field.label}</label>
        {field.description && (
          <p className="MainContent__description-text">{field.description}</p>
        )}
        {field.type === "text" && <input type="text" size={field.size || 20} />}
        {field.type === "select" && (
          <select disabled={field.disabled}>
            {field.options?.map((option, i) => (
              <option key={i} value={option.value}>
                {option.text}
              </option>
            ))}
          </select>
        )}
        {field.type === "checkbox" && (
          <label>
            <input type="checkbox" /> {field.optionLabel || ""}
          </label>
        )}
        {field.type === "button" && (
          <button className="MainContent__action-button" disabled={field.disabled}>
            {field.label}
          </button>
        )}
        {"value" in field && <span>{field.value}</span>}
      </div>
    );
  };

  const renderSection = (sectionData) =>
    Object.keys(sectionData).map((key, index) => {
      const item = sectionData[key];

      if (Array.isArray(item)) {
        return (
          <div key={index} className="MainContent__section-box">
            {item.map((field, i) => renderField(field, i, i === 0))}
          </div>
        );
      }

      if (typeof item === "object" && item !== null) {
        return (
          <div key={index} className="MainContent__section-box">
            <h3>{item.label || ""}</h3>
            {item.description && (
              <p className="MainContent__description-text">{item.description}</p>
            )}
            {Object.keys(item).map((subKey, subIndex) => {
              const subItem = item[subKey];
              if (typeof subItem === "object" && "label" in subItem) {
                return renderField(subItem, subIndex, subIndex === 0);
              }
              return null;
            })}
          </div>
        );
      }

      return null;
    });

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div className="MainContent__container">
      <div className="MainContent__content-container">
        <div className="MainContent__left-section">
          {jsonData.Section1 && renderSection(jsonData.Section1)}
        </div>
        <div className="MainContent__right-section">
          {jsonData.Section2 && renderSection(jsonData.Section2)}
        </div>
      </div>
    </div>
  );
}

export default MainContent;