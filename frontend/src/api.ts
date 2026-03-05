const API_URL = 'http://localhost:8000';

export interface BuildingData {
    height: number;
    footprint: number[][]; // [[x, y], [x, y], ...]
}

export interface MapData {
    features: BuildingData[];
    count: number;
    message?: string;
}

export const fetchMapData = async (lat: number, lon: number, radius: number = 300): Promise<MapData> => {
    try {
        const response = await fetch(`${API_URL}/map?lat=${lat}&lon=${lon}&radius=${radius}`);
        if (!response.ok) {
            throw new Error('Failed to fetch map data');
        }
        return await response.json();
    } catch (error) {
        console.error("API Fetch Error:", error);
        return { features: [], count: 0 };
    }
};

export const fetchWeather = async (lat: number, lon: number) => {
    const response = await fetch(`${API_URL}/weather?lat=${lat}&lon=${lon}`);
    return await response.json();
};
