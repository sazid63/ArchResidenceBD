import { useState } from "react";
import { useI18n } from "../i18n";
import { ARCHITECTURAL_ASSETS, ArchitecturalAsset } from "../cad/assetsLibrary";
import { Badge, Button, Card, PageHeader } from "../ui/kit";

export function AssetsLibraryScreen() {
  const { lang } = useI18n();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedAsset, setSelectedAsset] = useState<ArchitecturalAsset>(ARCHITECTURAL_ASSETS[0]);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const categories = [
    { id: "all", labelEn: "All Assets", labelBn: "সকল অ্যাসেট" },
    { id: "structural", labelEn: "Structural BIM", labelBn: "স্ট্রাকচারাল বিআইএম" },
    { id: "doors", labelEn: "Doors", labelBn: "দরজা" },
    { id: "windows", labelEn: "Windows", labelBn: "জানালা" },
    { id: "stairs", labelEn: "Staircases", labelBn: "সিঁড়ি" },
    { id: "balconies", labelEn: "Balconies", labelBn: "বারান্দা" },
    { id: "kitchen", labelEn: "Kitchen Slabs", labelBn: "রান্নাঘর কাউন্টার" },
    { id: "bathroom", labelEn: "Bathroom Bases", labelBn: "বাথরুম বেস" },
  ];

  const filteredAssets = ARCHITECTURAL_ASSETS.filter((a) => {
    const matchesCategory = activeCategory === "all" || a.category === activeCategory;
    const matchesSearch = searchQuery === "" || 
      a.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.nameBn.includes(searchQuery) ||
      a.descriptionEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.descriptionBn.includes(searchQuery) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "আর্কিটেকচারাল অ্যাসেট লাইব্রেরি" : "Architectural Asset Library"}
        subtitle={
          lang === "bn"
            ? "পূর্ব-প্রস্তুত ৩D দরজা, জানালা, সিঁড়ি, রান্নাঘর ও বাথরুম লেআউট — বিএনবিসি ২০২০ মানদণ্ড অনুযায়ী"
            : "Pre-engineered 3D parametric doors, windows, staircases, kitchen slabs & bathroom bases compliant with BNBC 2020"
        }
      />

      {/* Category Tabs */}
      <div className="stack" style={{ gap: "12px", marginBottom: "16px" }}>
        <div className="row-between" style={{ alignItems: "center" }}>
          <h4 style={{ margin: 0 }}>{lang === "bn" ? "শ্রেণিবিন্যাস" : "Categories"}</h4>
          <div className="row" style={{ gap: "8px" }}>
            <label htmlFor="assets-search-input" className="visually-hidden">
              {lang === "bn" ? "অ্যাসেট খুঁজুন" : "Search assets"}
            </label>
            <input
              type="text"
               id="assets-search-input"
              placeholder={lang === "bn" ? "অ্যাসেট খুঁজুন..." : "Search assets..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: "13px",
                width: "240px",
                outline: "none",
              }}
            />
            {searchQuery && (
              <Button
                variant="ghost"
                onClick={() => setSearchQuery("")}
                style={{ padding: "4px 8px", fontSize: "11px" }}
                title={lang === "bn" ? "সাফ করুন" : "Clear"}
              >
                ✕
              </Button>
            )}
          </div>
        </div>
        <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? "primary" : "soft"}
              onClick={() => setActiveCategory(cat.id)}
            >
              {lang === "bn" ? cat.labelBn : cat.labelEn}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        {/* Left Column: Asset Cards */}
        <div className="stack">
          {filteredAssets.map((asset) => (
            <Card
              key={asset.id}
              className="stack"
              style={{
                cursor: "pointer",
                border: selectedAsset.id === asset.id ? "1.5px solid var(--primary, #2563eb)" : "1px solid var(--border)",
              }}
              onClick={() => setSelectedAsset(asset)}
            >
              <div className="row-between">
                <h3 style={{ margin: 0 }}>{lang === "bn" ? asset.nameBn : asset.nameEn}</h3>
                <div className="row" style={{ gap: "4px" }}>
                  {asset.provenanceRepo && <Badge tone="sky">{asset.provenanceRepo.split("/")[0]}</Badge>}
                  <Badge tone="primary">{asset.category.toUpperCase()}</Badge>
                </div>
              </div>

              <p className="small muted" style={{ margin: 0 }}>
                {lang === "bn" ? asset.descriptionBn : asset.descriptionEn}
              </p>

              <div className="row-between" style={{ fontSize: "12px", color: "var(--ink-soft)" }}>
                <span>
                  <strong>{lang === "bn" ? "পরিমাপ:" : "Dimensions:"}</strong> {asset.dimensionsMm[0]} × {asset.dimensionsMm[1]} × {asset.dimensionsMm[2]} mm
                </span>
                <span>
                  <strong>{lang === "bn" ? "উপাদান:" : "Material:"}</strong> {asset.material}
                </span>
              </div>
            </Card>
          ))}
        </div>

        {/* Right Column: Selected Asset Inspector */}
        <div className="stack">
          <Card className="stack" style={{ position: "sticky", top: "20px" }}>
            <div className="row-between">
              <h3>{lang === "bn" ? "অ্যাসেট ইন্সপেক্টর" : "Asset Specification Inspector"}</h3>
              <Badge tone="sage">{lang === "bn" ? "স্বয়ংক্রিয় ৩D ইন্টিগ্রেটেড" : "Auto-Integrated in 3D"}</Badge>
            </div>

            <div
              style={{
                background: "var(--surface-sunken)",
                padding: "16px",
                borderRadius: "var(--r-md)",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "18px" }}>
                {lang === "bn" ? selectedAsset.nameBn : selectedAsset.nameEn}
              </h2>

              <div className="stack" style={{ gap: "8px", fontSize: "13px" }}>
                <div className="row-between">
                  <span className="muted">{lang === "bn" ? "ক্যাটাগরি:" : "Category:"}</span>
                  <span className="bold">{selectedAsset.category.toUpperCase()}</span>
                </div>
                {selectedAsset.provenanceRepo && (
                  <div className="row-between">
                    <span className="muted">Open Source Repo:</span>
                    <span className="mono bold">{selectedAsset.provenanceRepo}</span>
                  </div>
                )}
                {selectedAsset.ifcClass && (
                  <div className="row-between">
                    <span className="muted">IFC BIM Standard Class:</span>
                    <span className="mono bold">{selectedAsset.ifcClass}</span>
                  </div>
                )}
                <div className="row-between">
                  <span className="muted">{lang === "bn" ? "প্রস্থ (Width):" : "Width:"}</span>
                  <span className="mono bold">{selectedAsset.dimensionsMm[0]} mm</span>
                </div>
                <div className="row-between">
                  <span className="muted">{lang === "bn" ? "গভীরতা (Depth):" : "Depth:"}</span>
                  <span className="mono bold">{selectedAsset.dimensionsMm[1]} mm</span>
                </div>
                <div className="row-between">
                  <span className="muted">{lang === "bn" ? "উচ্চতা (Height):" : "Height:"}</span>
                  <span className="mono bold">{selectedAsset.dimensionsMm[2]} mm</span>
                </div>
                <div className="row-between">
                  <span className="muted">{lang === "bn" ? "ম্যাটেরিয়াল স্পেক:" : "Material Specification:"}</span>
                  <span className="bold">{selectedAsset.material}</span>
                </div>
              </div>

              <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--line)", fontSize: "12px", color: "var(--ink-soft)" }}>
                {lang === "bn"
                  ? "এই অ্যাসেটটি আপনার ভবনের ৩D মডেলের প্রতিটি ফ্লোর প্ল্যান ও ফ্রেমে স্বয়ংক্রিয়ভাবে সংযুক্ত করা হয়। এআই ফ্রিল্যান্সার বা ইউজার কোপাইলট এর কোনো পরিবর্তন চাইলে এটি সলিড ওপেনক্যাসকেড মেস পুনর্গণনা করে।"
                  : "This asset is automatically bound into your building's 3D OpenCASCADE model. When the AI copilot executes modifications, it recomputes these precise solids."}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
