# Munich PC Parts Picker

A small static parts picker for GitHub Pages. It keeps your build list in the browser and reads cached prices from `data/prices.json`.

## How prices work

GitHub Pages is static, so the browser cannot reliably fetch Idealo or shop pages directly. The included GitHub Actions workflow runs `scripts/update-prices.mjs` every six hours and writes the latest extracted offers to `data/prices.json`.

Each cached price update can use:

- `priorityUrl`: checked first and treated as your preferred information source.
- `urls`: optional extra product or shop URLs.

The web app also creates Idealo, Geizhals, Alternate, and Amazon.de search links from `query` or `name`, but the updater does not trust search-result pages as price sources. Direct Idealo product pages work best because one URL can provide the current and second offer. eBay offers are ignored.

## Add shared parts

Edit `data/parts.json`:

```json
{
  "parts": [
    {
      "id": "cpu-7800x3d",
      "category": "CPU",
      "name": "AMD Ryzen 7 7800X3D",
      "query": "AMD Ryzen 7 7800X3D boxed",
      "priorityUrl": "https://www.idealo.de/...",
      "urls": ["https://www.alternate.de/..."],
      "notes": "AM5 gaming CPU"
    }
  ]
}
```

Parts added in the web app are saved in your browser first. Export them from the header and replace `data/parts.json` with that JSON when you want GitHub Actions to refresh prices for everyone.

## Publish on GitHub Pages

1. Create a GitHub repo and push these files.
2. In GitHub, open **Settings > Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Select your default branch and `/root`.
5. Open the URL GitHub gives you.

Run the updater locally with:

```bash
node scripts/update-prices.mjs
```
