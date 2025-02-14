import React, { useEffect, useState } from "react";
import "./Component1.css";
import MainContent from "./MainContent";

function Component1() {
    const [options, setOptions] = useState([]);
    const [isOptionsVisible, setIsOptionsVisible] = useState(true);
    const [hoveredOption, setHoveredOption] = useState(null);
    const [selectedOption, setSelectedOption] = useState("Main"); // Default to "Main"
    const [doubleClickedOption, setDoubleClickedOption] = useState(null); // Track double-clicked option
    const [isCheckboxChecked, setIsCheckboxChecked] = useState(false); // Track checkbox state

    useEffect(() => {
        const fetchOptions = async () => {
            try {
                const response = await fetch("/OptionsContent.json");
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                setOptions(data.options || []);
            } catch (error) {
                console.error("Error fetching options:", error);
                setOptions([]);
            }
        };
        fetchOptions();
    }, []);

    const toggleOptions = () => {
        setIsOptionsVisible(!isOptionsVisible);
    };

    const handleOptionClick = (option) => {
        setSelectedOption(option);
    };

    const handleOptionDoubleClick = (option) => {
        setDoubleClickedOption(doubleClickedOption === option ? null : option);
    };

    const handleCheckboxChange = () => {
        setIsCheckboxChecked(!isCheckboxChecked); // Toggle checkbox state
    };

    // Determine the URL argument based on checkbox state
    const urlArgument = isCheckboxChecked ? "2" : "1"; 

    return (
        <div className="Component1__container">
            <div className={`Component1__options-container ${isOptionsVisible ? "Component1__show" : "Component1__hide"}`}>
                {Array.isArray(options) && options.length > 0 ? (
                    options.map((option, index) => (
                        <button
                            key={index}
                            className={`Component1__option-button 
                                ${selectedOption === option ? "Component1__selected" : ""}
                                ${hoveredOption === option ? "Component1__hovered" : ""}
                                ${doubleClickedOption === option ? "Component1__double-clicked" : ""}`} // Add double-clicked class
                            onMouseEnter={() => setHoveredOption(option)}
                            onMouseLeave={() => setHoveredOption(null)}
                            onClick={() => handleOptionClick(option)}
                            onDoubleClick={() => handleOptionDoubleClick(option)} 
                        >
                            {option}
                        </button>
                    ))
                ) : (
                    <p className="Component1__error-message">No options available.</p>
                )}
            </div>
            {selectedOption === "Main" && (
                <div className="content-container">
                    <MainContent url={urlArgument} /> {/* Pass the determined URL argument */}
                </div>
            )}
            <div className="Component1__sticky-buttons">
                <div>
                    <label className="toggle-parameters">
                        Show Parameters: 
                        <input 
                            type="checkbox" 
                            checked={isCheckboxChecked} // Bind checkbox to state
                            onChange={handleCheckboxChange} // Handle checkbox change
                        />
                    </label>
                </div>
                <div className="button-group">
                    <button className="Component1__sticky-button">Ok</button>
                    <button className="Component1__sticky-button">Cancel</button>
                    <button className="Component1__sticky-button">Help</button>
                </div>
            </div>
        </div>
    );
}

export default Component1;