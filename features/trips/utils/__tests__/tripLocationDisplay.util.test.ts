import {
  splitHubRouteLocationDisplay,
  splitTripLocationDisplay,
} from "../tripLocationDisplay.util";

describe("splitTripLocationDisplay", () => {
  it("puts venue in detail when city precedes venue before state", () => {
    const r = splitTripLocationDisplay(
      "Noida, World Trade Center, Uttar Pradesh",
    );
    expect(r.city.toLowerCase()).toBe("noida");
    expect(r.detail.toLowerCase()).toContain("world trade center");
    expect(r.detail.toLowerCase()).toContain("uttar pradesh");
  });

  it("puts venue in detail when city follows venue before state", () => {
    const r = splitTripLocationDisplay(
      "World Trade Center, Noida, Uttar Pradesh",
    );
    expect(r.city.toLowerCase()).toBe("noida");
    expect(r.detail.toLowerCase()).toContain("world trade center");
  });

  it("maps drop with taluk and district", () => {
    const r = splitTripLocationDisplay(
      "Vanapuram, Thandrampet, Tiruvannamalai",
    );
    expect(r.city.toLowerCase()).toBe("tiruvannamalai");
    expect(r.detail.toLowerCase()).toContain("vanapuram");
    expect(r.detail.toLowerCase()).toContain("thandrampet");
  });

  it("maps city before state", () => {
    const r = splitTripLocationDisplay("Chennai, Tamil Nadu");
    expect(r.city.toLowerCase()).toBe("chennai");
    expect(r.detail.toLowerCase()).toBe("tamil nadu");
  });

  it("embeds locality in single-line venue string", () => {
    const r = splitTripLocationDisplay("World Trade Center Noida");
    expect(r.city.toLowerCase()).toBe("noida");
    expect(r.detail.toLowerCase()).toContain("world trade center");
  });
});

describe("splitHubRouteLocationDisplay", () => {
  it("shows city and state only for city, state pairs", () => {
    const r = splitHubRouteLocationDisplay("Chennai, Tamil Nadu");
    expect(r.city.toLowerCase()).toBe("chennai");
    expect(r.state.toLowerCase()).toBe("tamil nadu");
  });

  it("extracts city and state from long venue strings", () => {
    const r = splitHubRouteLocationDisplay(
      "Brigade Gateway Campus, 26/1 Dr. Rajkumar Road, Malleswaram, Bengaluru, Karnataka",
    );
    expect(r.city.toLowerCase()).toBe("bengaluru");
    expect(r.state.toLowerCase()).toBe("karnataka");
    expect(r.city.toLowerCase()).not.toContain("brigade");
  });

  it("does not use full address as city line", () => {
    const r = splitHubRouteLocationDisplay(
      "Brigade Gateway Campus, 26/1 Dr. Rajkumar Road, Malleswaram, Bengaluru, Tamil Nadu",
    );
    expect(r.city.toLowerCase()).toBe("bengaluru");
    expect(r.state.toLowerCase()).toBe("tamil nadu");
    expect(r.city.length).toBeLessThan(24);
  });
});
