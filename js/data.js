// Tiny cached loader for the generated country bundle.

let countriesPromise = null;

export function loadCountries() {
  if (!countriesPromise) {
    countriesPromise = fetch('data/countries.json').then((res) => {
      if (!res.ok) {
        countriesPromise = null; // allow retry after a failed fetch
        throw new Error(`Failed to load countries.json: ${res.status}`);
      }
      return res.json();
    });
  }
  return countriesPromise;
}
