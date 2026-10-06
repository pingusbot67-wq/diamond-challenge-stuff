"""Real weather from Open-Meteo (free, no account or key needed): https://open-meteo.com"""

import json
import urllib.parse
import urllib.request

SOURCE = {"title": "Open-Meteo weather service", "url": "https://open-meteo.com"}

# WMO weather codes -> plain words (Claude translates them into the chosen language)
CODES = {
    0: "clear sky", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy",
    45: "foggy", 48: "foggy with frost",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "light rain showers", 81: "rain showers", 82: "heavy rain showers",
    85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail",
}


def _get(url, params):
    with urllib.request.urlopen(f"{url}?{urllib.parse.urlencode(params)}", timeout=10) as r:
        return json.loads(r.read().decode())


def find_place(place):
    """'Irvine, California' -> the best matching town (searches the name, then checks the state/country)."""
    name, _, hint = (p.strip() for p in place.partition(","))
    results = _get("https://geocoding-api.open-meteo.com/v1/search",
                   {"name": name, "count": 10, "language": "en", "format": "json"}).get("results") or []
    if not results:
        return None
    hint = hint.lower()
    for r in results:
        where = f"{r.get('admin1', '')} {r.get('country', '')} {r.get('country_code', '')}".lower()
        if hint and (hint in where or any(word in where for word in hint.split())):
            return r
    us = [r for r in results if r.get("country_code") == "US"]
    return (us or results)[0]


def get_weather(place, unit="F"):
    """Current weather plus the next 3 days, as a short report for Claude."""
    town = find_place(place)
    if not town:
        return {"error": f"Couldn't find a place called {place}."}
    f = unit.upper() != "C"
    data = _get("https://api.open-meteo.com/v1/forecast", {
        "latitude": town["latitude"],
        "longitude": town["longitude"],
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "temperature_unit": "fahrenheit" if f else "celsius",
        "wind_speed_unit": "mph" if f else "kmh",
        "timezone": "auto",
        "forecast_days": 3,
    })
    deg = "°F" if f else "°C"
    cur, daily = data["current"], data["daily"]
    days = []
    for i, label in enumerate(["today", "tomorrow", "day after tomorrow"]):
        days.append({
            "day": label,
            "date": daily["time"][i],
            "sky": CODES.get(daily["weather_code"][i], "mixed"),
            "high": f"{round(daily['temperature_2m_max'][i])}{deg}",
            "low": f"{round(daily['temperature_2m_min'][i])}{deg}",
            "chance_of_rain": f"{daily['precipitation_probability_max'][i] or 0}%",
        })
    return {
        "place": ", ".join(x for x in (town.get("name"), town.get("admin1"), town.get("country")) if x),
        "local_time": cur["time"],
        "now": {
            "sky": CODES.get(cur["weather_code"], "mixed"),
            "temperature": f"{round(cur['temperature_2m'])}{deg}",
            "feels_like": f"{round(cur['apparent_temperature'])}{deg}",
            "humidity": f"{cur['relative_humidity_2m']}%",
            "wind": f"{round(cur['wind_speed_10m'])} {'mph' if f else 'km/h'}",
        },
        "forecast": days,
        "source": SOURCE["title"],
    }


TOOL = {
    "name": "get_weather",
    "description": "Get the real current weather and the 3-day forecast for a town. Always use this for any "
                   "weather question (temperature, rain, whether to bring a coat) instead of guessing.",
    "input_schema": {
        "type": "object",
        "properties": {
            "place": {"type": "string", "description": "Town and state or country, in English, e.g. 'Irvine, California'"},
        },
        "required": ["place"],
        "additionalProperties": False,
    },
}
