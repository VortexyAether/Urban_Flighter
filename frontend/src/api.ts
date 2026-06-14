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

export interface FlowFieldGrid {
    nx: number;
    ny: number;
    cell_size_m: number;
    bounds: {
        min_x: number;
        max_x: number;
        min_y: number;
        max_y: number;
    };
    ux: number[];
    uy: number[];
    mask: number[];
    stats: {
        mean_speed_mps: number;
        max_speed_mps: number;
        blocked_fraction: number;
    };
}

export interface FlowField2DResponse {
    buildings: BuildingData[];
    weather: {
        wind_speed: number;
        wind_deg: number;
        description: string;
    };
    inlet: {
        ux: number;
        uy: number;
        speed_mps: number;
    };
    domain: {
        geometry_radius_m: number;
        solve_radius_m: number;
    };
    field: FlowFieldGrid;
    source?: {
        kind: string;
        area?: string;
        snapshot_t?: number;
        is_latest?: boolean;
        stride?: number;
        raw_grid?: number[];
    };
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

export const fetchFlowField2D = async (
    lat: number,
    lon: number,
    geometry_radius_m: number = 400,
    solve_radius_m: number = 400,
    grid_size_m: number = 20
): Promise<FlowField2DResponse> => {
    const response = await fetch(`${API_URL}/flow-fields/2d`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            lat,
            lon,
            geometry_radius_m,
            solve_radius_m,
            grid_size_m,
            use_real_weather: true,
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to fetch 2D flow field');
    }

    return await response.json();
};

export const fetchAeroJaxDemoFlow = async (stride: number = 8, snapshot_t?: number): Promise<FlowField2DResponse> => {
    const params = new URLSearchParams({ stride: String(stride) });
    if (snapshot_t !== undefined) {
        params.set('snapshot_t', String(snapshot_t));
    }
    const response = await fetch(`${API_URL}/flow-fields/aerojax-demo?${params.toString()}`);

    if (!response.ok) {
        throw new Error('Failed to fetch AeroJAX demo flow field');
    }

    return await response.json();
};
