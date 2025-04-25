// Initialize visualization when DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Define file paths for geographic data and statistical data
    const topoJsonUrl = './london_wards.json';
    const csvUrl = './combined_data.csv';
    
    // Load both files using Promise.all for parallel loading
    Promise.all([
        fetch(topoJsonUrl).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        }),
        d3.csv(csvUrl)
    ])
    .then(([topologyData, csvData]) => {
        // Log data for debugging purposes
        console.log("--- Raw Loaded TopoJSON Data ---");
        console.log(topologyData);
        console.log("--- Loaded CSV Data ---");
        console.log(csvData);
        
        // Validate TopoJSON data structure
        if (!topologyData || typeof topologyData !== 'object') {
            throw new Error("Loaded data is not a valid TopoJSON object.");
        }
        
        if (!topologyData.objects || typeof topologyData.objects !== 'object') {
            console.error("Failed Check: topologyData.objects is:", topologyData.objects);
            throw new Error("Invalid TopoJSON structure: 'objects' property missing or not an object at the top level.");
        }
        
        // Find available object keys in TopoJSON
        const availableObjectKeys = Object.keys(topologyData.objects);
        console.log("Available object keys in TopoJSON:", availableObjectKeys);
        
        // Use expected object name or fall back to first available key
        const objectName = 'London_Ward';
        const fallbackObjectName = availableObjectKeys[0];
        const useObjectName = topologyData.objects[objectName] ? objectName : fallbackObjectName;
        
        if (!useObjectName) {
            throw new Error("No valid geography objects found in TopoJSON data.");
        }
        
        console.log(`Using object key: "${useObjectName}"`);
        const specificObject = topologyData.objects[useObjectName];
        
        // Validate specific object structure
        if (!specificObject || typeof specificObject !== 'object' || !specificObject.type) {
            console.error("Invalid TopoJSON object:", specificObject);
            throw new Error(`Data associated with key "${useObjectName}" is not a valid TopoJSON geometry object.`);
        }
        
        // Process CSV data into required format for visualization
        const crimeData = processCsvData(csvData);
        
        // Initialize visualization with processed data
        initializeVisualization(topologyData, useObjectName, crimeData);
    })
    .catch(error => {
        console.error('Error caught during data loading/processing:', error);
        document.body.innerHTML = `<p>Error loading map data. Please try again later. Details: ${error.message}</p>`;
    });
});

/**
 * Process CSV data into standardized format for visualization
 * @param {Array} csvData - Raw CSV data as array of objects
 * @return {Object} Structured crime data by ward and year
 */
function processCsvData(csvData) {
    const crimeData = {};
    
    // Extract years from column headers (format: CRIME_TYPE_YEAR)
    const years = new Set();
    const crimeTypes = new Set();
    
    // Parse column headers to identify years and crime types
    Object.keys(csvData[0]).forEach(key => {
        if (key.includes('_')) {
            const parts = key.split('_');
            const year = parts[parts.length - 1];
            if (!isNaN(parseInt(year)) && year.length === 4) {
                years.add(parseInt(year));
                
                // Extract crime type from header
                const crimeType = parts.slice(0, -1).join('_');
                crimeTypes.add(crimeType);
            }
        }
    });
    
    // Convert Sets to Arrays and sort
    const yearArray = Array.from(years).sort();
    const crimeTypeArray = Array.from(crimeTypes);
    
    console.log("Available years:", yearArray);
    console.log("Available crime types:", crimeTypeArray);
    
    // Process data by ward
    csvData.forEach(row => {
        const wardName = row.WardName;
        const ward = row.Borough; // The ward belongs to this borough
        const population = parseFloat(row.Population) || 0;
        const deprivation = parseFloat(row.IMD_average_score) || 
                           parseFloat(row['IMD average score']) || 0;
        const incomeScore = parseFloat(row.Income_score) ||
                           parseFloat(row['Income score']) || 0;
        const employmentScore = parseFloat(row.Employment_score) ||
                               parseFloat(row['Employment score']) || 0;
        
        // Index data by ward name
        crimeData[wardName] = {};
        
        // Process data for each year
        yearArray.forEach(year => {
            // Initialize data structure for this ward and year
            crimeData[wardName][year] = {
                Borough: ward, // The parent borough of this ward
                Population: population, 
                Deprivation: deprivation,
                Income: incomeScore,
                Employment: employmentScore
            };
            
            let totalCrime = 0;
            
            // Process each crime type in this year
            crimeTypeArray.forEach(crimeType => {
                const columnName = `${crimeType}_${year}`;
                const crimeValue = parseFloat(row[columnName]) || 0;
                
                // Map to standard crime categories for consistent visualization
                let standardType;
                if (crimeType.includes('THEFT')) standardType = 'Theft';
                else if (crimeType.includes('VIOLENCE')) standardType = 'Violence';
                else if (crimeType.includes('SEXUAL')) standardType = 'Sexual';
                else if (crimeType.includes('DRUG')) standardType = 'Drugs';
                else if (crimeType.includes('ROBBERY')) standardType = 'Robbery';
                else if (crimeType.includes('BURGLARY')) standardType = 'Burglary';
                else if (crimeType.includes('VEHICLE')) standardType = 'Vehicle';
                else if (crimeType.includes('PUBLIC ORDER')) standardType = 'PublicOrder';
                else if (crimeType.includes('WEAPONS')) standardType = 'Weapons';
                else if (crimeType.includes('DAMAGE') || crimeType.includes('ARSON')) standardType = 'ArsonDamage';
                else if (crimeType.includes('FRAUD') || crimeType.includes('FORGERY')) standardType = 'FraudForgery';
                else standardType = 'Other';
                
                // Add to crime total
                totalCrime += crimeValue;
                
                // Store crime value or increment if category already exists
                if (!crimeData[wardName][year][standardType]) {
                    crimeData[wardName][year][standardType] = crimeValue;
                } else {
                    crimeData[wardName][year][standardType] += crimeValue;
                }
            });
            
            // Calculate and store total crime and per capita rates
            crimeData[wardName][year]['Total'] = totalCrime;
            crimeData[wardName][year]['PerCapita'] = population > 0 ? 
                (totalCrime / population * 1000) : 0;
                
            // Calculate per capita rates for each crime type
            ['Theft', 'Violence', 'Sexual', 'Drugs', 'Robbery', 'Burglary', 'Vehicle', 
             'PublicOrder', 'Weapons', 'ArsonDamage', 'FraudForgery', 'Other'].forEach(type => {
                if (crimeData[wardName][year][type]) {
                    crimeData[wardName][year][`${type}PerCapita`] = population > 0 ? 
                        (crimeData[wardName][year][type] / population * 1000) : 0;
                } else {
                    crimeData[wardName][year][type] = 0;
                    crimeData[wardName][year][`${type}PerCapita`] = 0;
                }
            });
        });
    });
    
    return crimeData;
}

/**
 * Initialize and configure the complete visualization
 * @param {Object} topologyData - TopoJSON data for London wards
 * @param {String} objectName - Key name for ward geometries in TopoJSON
 * @param {Object} crimeData - Processed crime data by ward and year
 */
function initializeVisualization(topologyData, objectName, crimeData) {
    // Select DOM elements and prepare variables
    const svg = d3.select("#map");
    const tooltip = d3.select("#tooltip");
    const dataFilterSelect = document.getElementById("dataFilter");
    const yearSlider = document.getElementById("yearSlider");
    const yearDisplay = document.getElementById("yearDisplay");
    const insightsTextElement = document.querySelector(".insights p:first-of-type");

    // Initialize state variables
    let dataFilter = dataFilterSelect.value;
    let year = parseInt(yearSlider.value);
    
    // Force simulation variables
    let simulation = null;
    let currentData = [];
    let forceStrength = 0.05;
    let centerX, centerY;

    // Create color scales for different data types with placeholder domains
    const colorScales = {
        // Crime types
        'AllCrime': d3.scaleSequential(d3.interpolateRdYlBu).domain([0, 100]),  
        'Theft': d3.scaleSequential(d3.interpolateBlues).domain([0, 50]),
        'Violence': d3.scaleSequential(d3.interpolateReds).domain([0, 30]),
        'Sexual': d3.scaleSequential(d3.interpolatePurples).domain([0, 10]),
        'Drugs': d3.scaleSequential(d3.interpolateGreens).domain([0, 15]),
        'Robbery': d3.scaleSequential(d3.interpolateOranges).domain([0, 20]),
        'Burglary': d3.scaleSequential(d3.interpolateBrBG).domain([0, 25]),
        'Vehicle': d3.scaleSequential(d3.interpolateYlGn).domain([0, 25]),
        'PublicOrder': d3.scaleSequential(d3.interpolateYlOrBr).domain([0, 15]),
        'Weapons': d3.scaleSequential(d3.interpolateRdPu).domain([0, 10]),
        'ArsonDamage': d3.scaleSequential(d3.interpolatePiYG).domain([0, 25]),
        'FraudForgery': d3.scaleSequential(d3.interpolateCool).domain([0, 25]),
        'Other': d3.scaleSequential(d3.interpolateGnBu).domain([0, 20]),
        
        // Deprivation metrics
        'Deprivation': d3.scaleSequential(d3.interpolateReds).domain([0, 50]),
        'Income': d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 0.3]),
        'Employment': d3.scaleSequential(d3.interpolatePuRd).domain([0, 0.3])
    };

    // Update available years from data
    const availableYears = Object.keys(Object.values(crimeData)[0] || {})
        .filter(key => !isNaN(parseInt(key)))
        .map(year => parseInt(year))
        .sort();

    // Configure year slider based on available data
    if (availableYears.length > 0) {
        yearSlider.min = Math.min(...availableYears);
        yearSlider.max = Math.max(...availableYears);
        yearSlider.value = availableYears[0];
        year = parseInt(yearSlider.value);
        if (yearDisplay) {
            yearDisplay.textContent = year;
        }
    }

    // Populate filter dropdown with data options
    populateDataFilterDropdown();

    // Add event listeners for user interaction
    dataFilterSelect.addEventListener("change", () => {
        dataFilter = dataFilterSelect.value;
        updateVisualization();
        updateInsightsText();
    });

    yearSlider.addEventListener("input", () => {
        year = parseInt(yearSlider.value);
        if (yearDisplay) {
                yearDisplay.textContent = year;
        }
        updateVisualization();
        updateInsightsText();
    });
    
    // Setup visualization dimensions
    const width = +svg.attr("width");
    const height = +svg.attr("height");
    const margin = { top: 30, right: 20, bottom: 20, left: 20 };
    const visWidth = width - margin.left - margin.right;
    const visHeight = height - margin.top - margin.bottom;
    
    // Set center coordinates for force layout
    centerX = visWidth / 2;
    centerY = visHeight / 2;

    // Create SVG groups for different visualization layers
    const mapGroup = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    const bubbleGroup = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    const legendGroup = svg.append("g").attr("transform", `translate(${width - 130}, ${height - 160})`);

    // Log dimensions for debugging
    console.log("Setting up projection with width:", visWidth, "height:", visHeight);
    if (visWidth <= 0 || visHeight <= 0) {
        console.error("ERROR: Visualization dimensions are invalid!");
    }
    
    // Create mesh from TopoJSON for ward boundaries
    const meshFeature = topojson.mesh(topologyData, topologyData.objects[objectName]);
    
    // Create temporary GeoJSON for projecting bounds
    const tempGeoJson = {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: meshFeature }]
    };
    
    // Configure map projection to fit data to visualization area
    const projection = d3.geoMercator()
        .fitSize([visWidth, visHeight], tempGeoJson);
        
    // Create path generator using projection
    const pathGenerator = d3.geoPath().projection(projection);

    // Verify projection parameters
    console.log("Projection scale:", projection.scale());
    console.log("Projection translate:", projection.translate());

    // Check for invalid projection parameters
    if (isNaN(projection.scale()) || isNaN(projection.translate()[0])) {
        throw new Error("Projection parameters are invalid (NaN). Check TopoJSON data.");
    }
    
    // Test projection with known coordinate
    const testPoint = [-0.1, 51.5]; // Central London approx.
    console.log(`Projecting ${testPoint}:`, projection(testPoint));
    
    // Extract individual ward features from TopoJSON
    const wards = topologyData.objects[objectName].geometries.map(geometry => {
        const feature = topojson.feature(topologyData, geometry);
        return feature;
    });
    
    // Render ward boundaries on map with better visibility
    mapGroup.selectAll("path")
        .data(wards)
        .enter()
        .append("path")
        .attr("d", pathGenerator)
        .attr("class", "ward")
        .attr("fill", "#d4d4d4")  // Darker fill for better visibility
        .attr("stroke", "#666")   // Add border to make boundaries more visible
        .attr("stroke-width", 0.5);

    // Initialize components
    createLegend();
    updateVisualization();
    updateInsightsText();

    /**
     * Creates force simulation for data points
     * @param {Array} data - Array of data points with position properties
     * @return {Object} D3 force simulation 
     */
    function createForceSimulation(data) {
        // Stop any existing simulation
        if (simulation) {
            simulation.stop();
        }
        
        // Create new simulation with optimized parameters
        simulation = d3.forceSimulation(data)
            .force("center", d3.forceCenter(centerX, centerY))
            .force("charge", d3.forceManyBody().strength(-5)) // Reduced repulsion for better grouping
            .force("collide", d3.forceCollide().radius(d => d.radius + 0.5).strength(0.8)) // Prevent overlap
            .force("x", d3.forceX().x(d => d.x).strength(forceStrength)) // Pull points toward their geospatial location
            .force("y", d3.forceY().y(d => d.y).strength(forceStrength))
            .alphaTarget(0) // Cool down completely
            .alphaDecay(0.1) // Faster cooling for responsive updates
            .on("tick", forceTick);
        
        simulation.alpha(0.3).restart();

        return simulation;
    }
    
    /**
     * Updates bubble positions on each force simulation tick
     */
    function forceTick() {
        bubbleGroup.selectAll(".bubble")
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);
    }

    /**
     * Populates the data filter dropdown with organized options
     */
    function populateDataFilterDropdown() {
        // Structure: [group_name, [option_values]]
        const dataOptions = [
            ["Crime Types", [
                ["AllCrime", "All Crime Types"],
                ["Theft", "Theft"],
                ["Violence", "Violence Against Person"],
                ["Sexual", "Sexual Offences"],
                ["Drugs", "Drug Offences"],
                ["Robbery", "Robbery"],
                ["Burglary", "Burglary"],
                ["Vehicle", "Vehicle Offences"],
                ["PublicOrder", "Public Order"],
                ["Weapons", "Weapons Possession"],
                ["ArsonDamage", "Arson & Criminal Damage"],
                ["FraudForgery", "Fraud & Forgery"],
                ["Other", "Other Crimes"]
            ]],
            ["Deprivation Metrics", [
                ["Deprivation", "Overall Deprivation (IMD Avg)"],
                ["Income", "Income Deprivation"],
                ["Employment", "Employment Deprivation"]
            ]]
        ];

        // Clear existing options
        dataFilterSelect.innerHTML = '';
        
        // Add option groups and options
        dataOptions.forEach(group => {
            const groupName = group[0];
            const options = group[1];
            
            const optgroup = document.createElement('optgroup');
            optgroup.label = groupName;
            
            options.forEach(option => {
                const [value, text] = option;
                const optionElement = document.createElement('option');
                optionElement.value = value;
                optionElement.textContent = text;
                optgroup.appendChild(optionElement);
            });
            
            dataFilterSelect.appendChild(optgroup);
        });
        
        // Set initial value
        dataFilter = dataFilterSelect.value;
    }

    /**
     * Updates visualization based on current filter and year selection
     */
    function updateVisualization() {
        // Group geometries by ward name to handle multipolygons
        const wardMap = new Map();
        
        // First pass: group geometries by ward name
        topologyData.objects[objectName].geometries.forEach(geometry => {
            const properties = geometry.properties || {};
            const wardName = properties.name;
            
            if (!wardName) {
                console.warn("Ward feature missing expected name property:", properties);
                return;
            }
            
            // Create or update ward entry
            if (!wardMap.has(wardName)) {
                wardMap.set(wardName, {
                    name: wardName,
                    geometries: [geometry],
                    properties: properties
                });
            } else {
                // Add this geometry to the existing ward entry
                wardMap.get(wardName).geometries.push(geometry);
            }
        });
        
        // Second pass: process each unique ward
        let rawData = Array.from(wardMap.values()).map(ward => {
            const wardName = ward.name;
            const wData = crimeData[wardName]?.[year] || {};
            
            // Determine which values to use based on data filter
            let sizeValue, colorValue;
            
            // For all filters, use crime per capita for bubble size
            sizeValue = wData.PerCapita || 0;
            
            // Set color value based on selected filter
            if (dataFilter === 'Deprivation') {
                colorValue = wData.Deprivation || 0;
            } else if (dataFilter === 'Income') {
                colorValue = wData.Income || 0;
            } else if (dataFilter === 'Employment') {
                colorValue = wData.Employment || 0;
            } else {
                // It's a crime type filter
                if (dataFilter === 'AllCrime') {
                    colorValue = wData.Total || 0;
                } else {
                    colorValue = wData[dataFilter] || 0;
                }
            }
            
            // Calculate centroid from combined ward geometries
            let featureGeometries = [];
            let featureCollection = { type: "FeatureCollection", features: [] };
            
            // Convert each geometry to a feature
            ward.geometries.forEach(geometry => {
                const feature = topojson.feature(topologyData, geometry);
                featureCollection.features.push(feature);
            });
            
            // Calculate average centroid position
            let x = 0, y = 0, totalFeatures = featureCollection.features.length;
            
            featureCollection.features.forEach(feature => {
                const centroid = d3.geoCentroid(feature);
                const projectedCentroid = projection(centroid);
                
                if (projectedCentroid && !isNaN(projectedCentroid[0]) && !isNaN(projectedCentroid[1])) {
                    x += projectedCentroid[0];
                    y += projectedCentroid[1];
                } else {
                    console.warn(`Invalid centroid for ward: ${wardName}`);
                    totalFeatures--; // Don't count invalid features
                }
            });
            
            // Calculate final centroid or use center if invalid
            const centroidX = totalFeatures > 0 ? x / totalFeatures : centerX;
            const centroidY = totalFeatures > 0 ? y / totalFeatures : centerY;
            
            return {
                name: wardName,
                sizeValue: sizeValue,           // Value for bubble size
                colorValue: colorValue,         // Value for bubble color
                deprivation: wData.Deprivation || 0,
                income: wData.Income || 0,
                employment: wData.Employment || 0,
                crimeDetails: wData,
                properties: ward.properties,
                // Initial position for force layout
                x: centroidX,
                y: centroidY,
                // Store original position for reference
                originalX: centroidX,
                originalY: centroidY,
                // Flag to determine if ward should be displayed
                display: dataFilter === 'Deprivation' ? (wData.Deprivation > 0) :
                        dataFilter === 'Income' ? (wData.Income > 0) :
                        dataFilter === 'Employment' ? (wData.Employment > 0) :
                        (wData.Population > 0 && wData.PerCapita > 0)
            };
        });
    
        // Filter out wards with missing or invalid data
        currentData = rawData.filter(d => d.display);
    
        // Update color scale domain based on actual data values
        const maxColorValue = d3.max(currentData, d => d.colorValue) || 1;
        const paddingFactor = 1.1; // 10% padding to avoid highest value at edge of scale
        
        // Update the color scale for the current filter
        const baseScale = colorScales[dataFilter];
        const updatedColorScale = baseScale.copy().domain([0, maxColorValue * paddingFactor]);
        
        // Use the updated color scale
        colorScales[dataFilter] = updatedColorScale;
    
        // Calculate scale for bubble sizing
        const maxSizeValue = d3.max(currentData, d => d.sizeValue) || 1;
        const bubbleScale = d3.scaleSqrt()
            .domain([0, maxSizeValue])
            .range([2, 20]);  // Size range for visibility
            
        // Add radius to each data point for force layout
        currentData.forEach(d => {
            d.radius = bubbleScale(d.sizeValue);
        });
    
        // Update visualization bubbles
        const bubbles = bubbleGroup.selectAll(".bubble")
            .data(currentData, d => d.name);
    
        // Remove exiting bubbles
        bubbles.exit().remove();
    
        // Create new bubbles
        const enterBubbles = bubbles.enter()
            .append("circle")
            .attr("class", "bubble")
            .attr("cx", d => d.originalX)
            .attr("cy", d => d.originalY)
            .attr("r", 0)
            .on("mouseover", handleMouseOver)
            .on("mousemove", handleMouseMove)
            .on("mouseout", handleMouseOut);
    
        // Update all bubbles (new and existing)
        bubbles.merge(enterBubbles)
            .transition()
            .duration(500)
            .attr("r", d => d.radius)
            .style("fill", d => {
                return colorScales[dataFilter](d.colorValue);
            })
            .style("fill-opacity", 0.7);
            
        // Start force simulation to position bubbles
        const sim = createForceSimulation(currentData);
        // Run simulation with initial higher energy
        sim.alpha(0.3).restart();
        // Stop simulation after initial positioning
        setTimeout(() => sim.alpha(0).stop(), 1500);
        
        // Update legend with new scale
        updateLegend();
    }

    /**
     * Handles mouse over events on bubbles
     * @param {Event} event - Mouse event
     * @param {Object} d - Data point for hovered bubble
     */
    function handleMouseOver(event, d) {
        // Stop simulation when interacting with bubbles
        if (simulation) {
            simulation.stop();
        }
    
        // Apply visual highlighting
        d3.select(this)
            .style("stroke", "black")
            .style("stroke-width", 2);
    
        const wardName = d.name;
        
        // Format tooltip data based on current filter
        const population = d.crimeDetails.Population?.toLocaleString() ?? 'N/A';
        const totalCrime = d.crimeDetails.Total?.toLocaleString() ?? 'N/A';
        const crimePerCapita = d.crimeDetails.PerCapita?.toFixed(2) ?? 'N/A';
        let valueText = '';
        
        if (['Deprivation', 'Income', 'Employment'].includes(dataFilter)) {
            // Format for deprivation metrics
            const metricName = dataFilter.charAt(0).toUpperCase() + dataFilter.slice(1);
            const metricValue = d.crimeDetails[metricName]?.toFixed(2) ?? 'N/A';
            valueText = `${metricName} Score: ${metricValue} | Crime: ${totalCrime} (${crimePerCapita} per 1000)`;
        } else {
            // Format for crime metrics
            if (dataFilter === 'AllCrime') {
                valueText = `Total Crime: ${totalCrime} (${crimePerCapita} per 1000)`;
            } else {
                const crimeName = dataFilter;
                const crimeValue = d.crimeDetails[crimeName]?.toFixed(1) ?? 'N/A';
                const perCapita = d.crimeDetails[`${crimeName}PerCapita`]?.toFixed(2) ?? 'N/A';
                valueText = `${crimeName} Crime: ${crimeValue} (${perCapita} per 1000)`;
            }
        }
    
        // Populate tooltip with data
        tooltip.select("#tooltip-title").text(wardName);
        tooltip.select("#tooltip-value").text(valueText);
        tooltip.select("#tooltip-population").text(`Population: ${population}`);
        tooltip.select("#tooltip-deprivation").text(`Deprivation: ${d.deprivation.toFixed(2)}`);
        tooltip.select("#tooltip-year").text(`Year: ${year}`);
    
        // Show tooltip
        tooltip.style("opacity", 1);
        handleMouseMove(event);
    }

    /**
     * Handles mouse movement to position tooltip
     * @param {Event} event - Mouse event
     */
    function handleMouseMove(event) {
        // Get mouse coordinates
        const [mouseX, mouseY] = d3.pointer(event);
        
        // Position tooltip near cursor
        tooltip.style("left", `${mouseX + margin.left + 150}px`)
               .style("top", `${mouseY + margin.top + 80}px`);
    }

    /**
     * Handles mouse out events on bubbles
     */
    function handleMouseOut() {
        // Remove highlighting
        d3.select(this)
            .transition()
            .duration(200)
            .style("stroke", null)
            .style("stroke-width", null);
    
        // Hide tooltip
        tooltip.style("opacity", 0);
    }

    /**
     * Create initial legend structure
     */
    function createLegend() {
        legendGroup.append("text")
            .attr("x", 0)
            .attr("y", 0)
            .attr("font-weight", "bold")
            .text("Legend");
        updateLegend();
    }

    /**
     * Updates legend based on current data filter
     */
    function updateLegend() {
        // Remove previous legend items
        legendGroup.selectAll(".legend-item").remove();

        // Format legend title based on filter
        let legendTitle = dataFilter;
        if (dataFilter === 'AllCrime') legendTitle = 'All Crime';
        else if (dataFilter === 'PublicOrder') legendTitle = 'Public Order';
        else if (dataFilter === 'ArsonDamage') legendTitle = 'Arson & Criminal Damage';
        else if (dataFilter === 'FraudForgery') legendTitle = 'Fraud & Forgery';
        
        // Add title
        legendGroup.append("text")
            .attr("class", "legend-item")
            .attr("x", 0)
            .attr("y", 20)
            .attr("font-weight", "bold")
            .text(legendTitle);
        
        // Get current color scale
        const colorScale = colorScales[dataFilter];
        
        // Find min and max values in dataset
        const minValue = d3.min(currentData, d => d.colorValue) || 0;
        const actualMaxValue = d3.max(currentData, d => d.colorValue) || 1;
        
        // Use 80% of max for legend steps to ensure most data is visible
        const legendMaxValue = actualMaxValue * 0.8;
        
        // Create color steps for legend
        const colorSteps = [];
        const stepCount = 5;
        
        // Add minimum as first step
        colorSteps.push(minValue);
        
        // Calculate evenly spaced steps between min and max
        if (minValue < legendMaxValue) {
            const range = legendMaxValue - minValue;
            const remainingSteps = stepCount - 1; // -1 because we already added the minimum
            
            for (let i = 1; i <= remainingSteps; i++) {
                colorSteps.push(minValue + (range * i / remainingSteps));
            }
        } else {
            // If min equals max, just repeat the value
            for (let i = 1; i <= stepCount; i++) {
                colorSteps.push(minValue);
            }
        }
        
        // Sort from highest to lowest for display
        colorSteps.sort((a, b) => b - a);
        
        // Create a larger, more visible legend
        colorSteps.forEach((value, i) => {
            const legendEntry = legendGroup.append("g")
                .attr("class", "legend-item")
                .attr("transform", `translate(0, ${45 + i * 20})`);  // Spaced for readability

            legendEntry.append("rect")
                .attr("x", 0)
                .attr("y", 0) 
                .attr("width", 15)
                .attr("height", 15)
                .style("fill", colorScale(value))
                .style("stroke", "#000")  // Border for better visibility
                .style("stroke-width", 0.5);

            // Add "+" to highest value
            legendEntry.append("text")
                .attr("x", 20)
                .attr("y", 12)
                .style("font-size", "12px")
                .text(i === 0 ? `${value.toFixed(1)}+` : `${value.toFixed(1)}`);
        });
        
        // Add legend explanation for all crime view
        if (dataFilter === 'AllCrime') {
            legendGroup.append("text")
                .attr("class", "legend-item")
                .attr("x", 0)
                .attr("y", 45 + colorSteps.length * 20 + 15)
                .attr("font-style", "italic")
                .attr("font-size", "10px")
                .text("Higher values = more crime");
        }
    }

    /**
     * Updates the insights text based on current filter and year
     */
    function updateInsightsText() {
        if (!insightsTextElement) return;
    
        const year = yearSlider.value;
        let insightText = '';
        
        // Get user-friendly name for the filter
        let filterName = dataFilter;
        if (dataFilter === 'AllCrime') filterName = 'All Crime Types';
        else if (dataFilter === 'PublicOrder') filterName = 'Public Order Offences';
        else if (dataFilter === 'ArsonDamage') filterName = 'Arson & Criminal Damage';
        else if (dataFilter === 'FraudForgery') filterName = 'Fraud & Forgery';
    
        // Customize text based on filter type
        if (['Deprivation', 'Income', 'Employment'].includes(dataFilter)) {
            insightText = `The map shows ${dataFilter.toLowerCase()} levels across London wards for ${year}. Bubble size represents crime per 1000 people, and color intensity indicates ${dataFilter.toLowerCase()} scores.`;
        } else {
            insightText = `The map shows ${filterName} rates across London wards for ${year}. Bubble size represents crime per 1000 people, and color intensity shows the total amount.`;
        }
        
        // Update the DOM element
        insightsTextElement.textContent = insightText;
    }
}