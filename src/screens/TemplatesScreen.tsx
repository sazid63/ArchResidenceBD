import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader } from "../ui/kit";
import { generateRandomBuildingProject, createNewProject } from "../engine/projectState";

interface DesignTemplate {
  id: string;
  nameEn: string;
  nameBn: string;
  location: string;
  stories: number;
  plotKatha: number;
  unitsPerFloor: number;
  presetId: string;
  descriptionEn: string;
  descriptionBn: string;
}

const BUILDING_TEMPLATES: DesignTemplate[] = [
  {
    id: "tpl-1",
    nameEn: "Padma Garden Heights (6-Storey Dual 3-Bed Flats)",
    nameBn: "পদ্মা গার্ডেন হাইটস (৬ তলা দ্বৈত ফ্ল্যাট)",
    location: "Road 11, Banani, Dhaka",
    stories: 6,
    plotKatha: 4.2,
    unitsPerFloor: 2,
    presetId: "preset-dual-3bed",
    descriptionEn: "Standard 6-storey Dhaka residential building with 2 balanced units per floor and ground parking.",
    descriptionBn: "ঢাকার সর্বাধিক জনপ্রিয় ৬ তলা অ্যাপার্টমেন্ট বিন্যাস। প্রতি তলায় ২টি ফ্ল্যাট ও নিচতলায় কার পার্কিং।",
  },
  {
    id: "tpl-2",
    nameEn: "Shapla Executive Villa (7-Storey Full-Floor Flat)",
    nameBn: "শাপলা এক্সিকিউটিভ ভিলা (৭ তলা ফুল-ফ্লোর ফ্ল্যাট)",
    location: "Sector 4, Uttara, Dhaka",
    stories: 7,
    plotKatha: 4.8,
    unitsPerFloor: 1,
    presetId: "preset-single-luxury",
    descriptionEn: "Luxury 7-storey full-floor flat with 4 Bedrooms, Family Living, Formal Dining, and Servant Suite.",
    descriptionBn: "৭ তলা লাক্সারি ফুল-ফ্লোর ফ্ল্যাট। ৪ বেডরুম, ফ্যামিলি লিভিং, ফরমাল ডাইনিং ও ৩টি চওড়া বারান্দা।",
  },
  {
    id: "tpl-3",
    nameEn: "Jamuna Rental Suite (8-Storey Triple 2-Bed Flats)",
    nameBn: "যমুনা রেন্টাল সুইট (৮ তলা ৩ ইউনিট ফ্ল্যাট)",
    location: "Mirpur DOHS, Dhaka",
    stories: 8,
    plotKatha: 5.2,
    unitsPerFloor: 3,
    presetId: "preset-triple-rental",
    descriptionEn: "8-Storey high yield rental building plan with 3 compact 2-Bed units per floor.",
    descriptionBn: "সর্বোচ্চ ভাড়া আয়ের জন্য ৮ তলা ভবন। প্রতি তলায় ৩টি ২-বেডরুমের স্বাধীন ফ্ল্যাট।",
  },
  {
    id: "tpl-4",
    nameEn: "Purbachal Duplex Villa (2-Storey Open Courtyard)",
    nameBn: "পূর্বাচল ডুপ্লেক্স ভিলা (২ তলা রাজকীয় বাড়ি)",
    location: "Sector 1, Purbachal Smart City, Dhaka",
    stories: 2,
    plotKatha: 3.5,
    unitsPerFloor: 1,
    presetId: "preset-duplex-courtyard",
    descriptionEn: "Private 2-storey duplex villa with central open courtyard (Aangina) and double-height lounge.",
    descriptionBn: "খোলা উঠোন (আঙিনা) ও ডাবল-হাইট ফ্যামিলি লাউঞ্জ সংবলিত ২ তলা অভিজাত ডুপ্লেক্স প্ল্যান।",
  },
  {
    id: "tpl-5",
    nameEn: "South Khulshi Corner Tower (6-Storey Corner Plot)",
    nameBn: "সাউথ খুলশী কর্নার টাওয়ার (৬ তলা কর্নার প্লট)",
    location: "Road 3, South Khulshi, Chittagong",
    stories: 6,
    plotKatha: 4.5,
    unitsPerFloor: 2,
    presetId: "preset-dual-3bed",
    descriptionEn: "Chittagong corner plot building with dual road frontage cantilever balconies.",
    descriptionBn: "চট্টগ্রাম সাউথ খুলশী কর্নার প্লটের ভবন। দুই পাশে সড়ক ও চওড়া ক্যান্টিলিভার বারান্দা।",
  },
  {
    id: "tpl-6",
    nameEn: "Farmgate Studio Apartments (6-Storey 4-Unit)",
    nameBn: "ফার্মগেট স্টুডিও অ্যাপার্টমেন্টস (৬ তলা ৪ ইউনিট)",
    location: "Indira Road, Farmgate, Dhaka",
    stories: 6,
    plotKatha: 3.8,
    unitsPerFloor: 4,
    presetId: "preset-studio-bachelor",
    descriptionEn: "High-density studio & 1-bed bachelor apartment layout near commercial hubs.",
    descriptionBn: "ফার্মগেট বাণিজ্যিক এলাকার কাছে ৪ ইউনিটের স্টুডিও ও ১-বেড ব্যাচেলর ফ্ল্যাট বিন্যাস।",
  },
  {
    id: "tpl-7",
    nameEn: "Pragoti Mixed Tower (7-Storey Showroom + Flats)",
    nameBn: "প্রগতি মিক্সড টাওয়ার (৭ তলা শোরুম ও ফ্ল্যাট)",
    location: "Pragoti Sarani, Baridhara, Dhaka",
    stories: 7,
    plotKatha: 5.5,
    unitsPerFloor: 2,
    presetId: "preset-commercial-mixed",
    descriptionEn: "Commercial display showroom on lower floors with 3-bed residential flats above.",
    descriptionBn: "প্রধান সড়ক সংলগ্ন মিক্সড প্ল্যান: নিচের তলায় ব্যাংক/শোরুম এবং ওপরের তলাগুলোতে ফ্ল্যাট।",
  },
  {
    id: "tpl-8",
    nameEn: "Sylhet Family Residence (4-Storey Joint Family)",
    nameBn: "সিলেট ফ্যামিলি রেসিডেন্স (৪ তলা যৌথ পরিবার)",
    location: "Zindabazar, Sylhet",
    stories: 4,
    plotKatha: 3.6,
    unitsPerFloor: 1,
    presetId: "preset-family-duplex",
    descriptionEn: "Joint family ownership building featuring dedicated Namaz Room & Prayer Suite.",
    descriptionBn: "যৌথ পরিবারের ঐতিহ্যবাহী ৪ তলা ভবন। ডেডিকেটেড নামাজ ঘর ও সুপরিসর ডাইনিং হল।",
  },
  {
    id: "tpl-9",
    nameEn: "Gulshan Sky Penthouse (8-Storey Luxury Suite)",
    nameBn: "গুলশান স্কাই পেপেন্টহাউস (৮ তলা স্কাই পুল টাওয়ার)",
    location: "Road 71, Gulshan 2, Dhaka",
    stories: 8,
    plotKatha: 6.0,
    unitsPerFloor: 1,
    presetId: "preset-penthouse-luxury",
    descriptionEn: "Elite Gulshan 2 residence with private rooftop swimming pool deck and glass lounge.",
    descriptionBn: "অভিজাত গুলশান ৮ তলা ভবন। প্রাইভেট রূফটপ স্কাই সুইমিং পুল, বারবিকেল ও গ্লাস লাউঞ্জ।",
  },
  {
    id: "tpl-10",
    nameEn: "Lalbagh Heritage Residence (6-Storey Narrow Plot)",
    nameBn: "লালবাগ হেরিটেজ রেসিডেন্স (৬ তলা সরু প্লট)",
    location: "Water Works Road, Lalbagh, Old Dhaka",
    stories: 6,
    plotKatha: 2.8,
    unitsPerFloor: 2,
    presetId: "preset-narrow-duct",
    descriptionEn: "Engineered for narrow Old Dhaka plots (25ft x 80ft) with central BNBC airshaft duct.",
    descriptionBn: "পুরান ঢাকার সরু প্লটের (২৫x৮০ ফুট) জন্য উপযোগী বিন্যাস। সেন্ট্রাল এয়ারশ্যাফ্ট ডাঙ্কট সহ।",
  },
];

export function TemplatesScreen({ onPick }: { onPick: (id: string) => void }) {
  const { lang } = useI18n();

  const handlePickTemplate = (tpl: DesignTemplate) => {
    const project = createNewProject({
      name: tpl.nameEn,
      stories: tpl.stories,
      plotSize: tpl.plotKatha,
      plotUnit: "katha",
      unitsPerFloor: tpl.unitsPerFloor,
      address: tpl.location,
    });

    // Mark all phases completed with this preset
    const updatedPhases = project.phases.map((p) => ({
      ...p,
      status: "completed" as const,
      data: {
        ...p.data,
        selectedFloorplanPreset: p.kind === "ground_floor" ? "preset-ground-parking" : tpl.presetId,
      },
    }));

    const finalProject = { ...project, phases: updatedPhases, designStarted: true };
    localStorage.setItem("archres_v2_active_project", JSON.stringify(finalProject));

    onPick("design:final");
  };

  const handlePickRandom = () => {
    generateRandomBuildingProject();
    onPick("design:final");
  };

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "১০টি প্রাক-প্রকৌশল ভবন টেমপ্লেট" : "10 Pre-Engineered Building Design Templates"}
        subtitle={
          lang === "bn"
            ? "বাংলাদেশি বিভিন্ন অঞ্চলের জন্য প্রস্তুত ১০টি সুনির্দিষ্ট রাজউক ও বিএনবিসি মানসম্মত ভবন টেমপ্লেট"
            : "Select from 10 distinct RAJUK & BNBC compliant building designs engineered for Bangladeshi plots"
        }
        actions={
          <Button
            variant="primary"
            style={{ background: "var(--tone-brand, #3b82f6)", display: "flex", alignItems: "center", gap: "6px" }}
            onClick={handlePickRandom}
          >
            🎲 {lang === "bn" ? "র্যান্ডম ডিজাইন তৈরি করুন" : "Generate Random Design"}
          </Button>
        }
      />

      <div className="stack" style={{ gap: "12px" }}>
        {BUILDING_TEMPLATES.map((tpl) => (
          <Card key={tpl.id} className="stack" style={{ padding: "16px" }}>
            <div className="row-between">
              <div>
                <h3 style={{ margin: "0 0 4px 0" }}>{lang === "bn" ? tpl.nameBn : tpl.nameEn}</h3>
                <span className="muted small">{tpl.location}</span>
              </div>
              <Badge tone="sky">
                {tpl.stories} {lang === "bn" ? "তলা" : "Stories"} · {tpl.plotKatha} {lang === "bn" ? "কাঠা" : "Katha"}
              </Badge>
            </div>

            <p className="small muted" style={{ margin: "4px 0" }}>
              {lang === "bn" ? tpl.descriptionBn : tpl.descriptionEn}
            </p>

            <div className="row-between" style={{ marginTop: "6px" }}>
              <div className="row" style={{ gap: "8px" }}>
                <Badge tone="neutral">
                  {tpl.unitsPerFloor} {lang === "bn" ? "ইউনিট / তলা" : "Unit(s) / Floor"}
                </Badge>
                <Badge tone="neutral">{tpl.presetId}</Badge>
              </div>
              <Button variant="primary" onClick={() => handlePickTemplate(tpl)}>
                {lang === "bn" ? "এই টেমপ্লেটে ৩D তৈরি করুন ➔" : "Generate 3D Building Design ➔"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
