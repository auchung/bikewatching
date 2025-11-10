import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';


console.log('Mapbox GL JS Loaded:', mapboxgl)
const svg = d3.select('#map').select('svg');

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiYXVjaHVuZyIsImEiOiJjbWh0ZGY1aWMxc2xnMmtxMXRlZHc3eXh5In0.wF3ZQ8Om7dXJhWKuxAUBSw';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

// Bike lane style
const lineStyle = {
    'line-color': '#32D400',  // bright green
    'line-width': 5,
    'line-opacity': 0.6,
  };

// Global helper functions
function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id
    );
    const arrivals = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.end_station_id
    );
    return stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });
  }
  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }
  function filterTripsbyTime(trips, timeFilter) {
    if (timeFilter === -1) return trips;
    return trips.filter((trip) => {
      const startedMinutes = minutesSinceMidnight(trip.started_at);
      const endedMinutes = minutesSinceMidnight(trip.ended_at);
      return (
        Math.abs(startedMinutes - timeFilter) <= 60 ||
        Math.abs(endedMinutes - timeFilter) <= 60
      );
    });
  }
  function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
  }
  

map.on('load', async () => {
    // Boston Bike Network
    map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });
  
    map.addLayer({
      id: 'boston-bike-lanes',
      type: 'line',
      source: 'boston_route',
      paint: lineStyle,
    });
  
    // Cambridge Bike Network
    map.addSource('cambridge_route', {
      type: 'geojson',
      data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
    });
  
    map.addLayer({
      id: 'cambridge-bike-lanes',
      type: 'line',
      source: 'cambridge_route',
      paint: lineStyle, 
    });

    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const jsonData = await d3.json(jsonurl);
    
    let trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
              trip.started_at = new Date(trip.started_at);
              trip.ended_at = new Date(trip.ended_at);
              return trip;
            }
    );
          
    let stations = computeStationTraffic(jsonData.data.stations, trips);

    let radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(stations, (d) => d.totalTraffic)])
        .range([0, 25]);

    let stationFlow = d3.scaleQuantize()
        .domain([0, 1])
        .range([0, 0.5, 1]);
          
    const circles = svg.selectAll('circle')
        .data(stations, (d) => d.short_name)
        .enter()
        .append('circle')
        .attr('r', (d) => radiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.6)
        .attr('pointer-events', 'auto')
        .each(function(d) {
            d3.select(this).append('title')
            .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });
    
    function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat);
        const { x, y } = map.project(point);
        return { cx: x, cy: y };
    }
        
    function updatePositions() {
        circles
            .attr('cx', (d) => getCoords(d).cx)
            .attr('cy', (d) => getCoords(d).cy);
    }

    updatePositions();
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);
          
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('time-display');
    const anyTimeLabel = document.getElementById('any-time');
          
    function updateScatterPlot(timeFilter) {
        const filteredTrips = filterTripsbyTime(trips, timeFilter);
        const filteredStations = computeStationTraffic(stations, filteredTrips);
      
        timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
      
        circles
          .data(filteredStations, d => d.short_name)
          .join('circle')
          .attr('r', d => radiusScale(d.totalTraffic))
          .style('--departure-ratio', d => {
            const ratio = d.totalTraffic > 0 ? d.departures / d.totalTraffic : 0.5; // fallback to balanced if invalid
            return stationFlow(Math.min(1, Math.max(0, ratio))); // clamp 0–1
          });
        updatePositions();
      }
          

      function updateTimeDisplay() {
        let timeFilter = Number(timeSlider.value); // Get slider value
      
        if (timeFilter === -1) {
          selectedTime.textContent = ''; // Clear time display
          anyTimeLabel.style.display = 'block'; // Show "(any time)"
        } else {
          selectedTime.textContent = formatTime(timeFilter); // Display formatted time
          anyTimeLabel.style.display = 'none'; // Hide "(any time)"
        }
      
        // Call updateScatterPlot to reflect the changes on the map
        updateScatterPlot(timeFilter);
      }

timeSlider.addEventListener('input', updateTimeDisplay);
updateTimeDisplay();
    
});
