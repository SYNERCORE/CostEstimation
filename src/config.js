const SHIFTS = {
  regular_day: {
    label: "Regular Day Shift",
    mult: 1
  },
  regular_night: {
    label: "Regular Night Shift",
    mult: 1.25
  },
  sunday_day: {
    label: "Sunday Day (Non-working)",
    mult: 1.3
  },
  sunday_night: {
    label: "Sunday Night (Non-working)",
    mult: 1.625
  },
  holiday_day: {
    label: "Legal Holiday Day",
    mult: 2
  },
  holiday_night: {
    label: "Legal Holiday Night",
    mult: 2.5
  }
};
const CE_CFG = {
  onsite: {
    color: "#58A6FF",
    mobDemob: true,
    docNo: "SHIC-F-TSG-25",
    hasConc: true
  },
  shopworks: {
    color: "#A78BFA",
    mobDemob: true,
    docNo: "SHIC-F-TSG-025",
    hasConc: false
  },
  supply: {
    color: "#3FB950",
    mobDemob: false,
    docNo: "SHIC-F-TSG-025",
    hasConc: false
  }
};
const MISC_DEF = {
  onsite: [["accommodation", "G.1 Accommodation"], ["transportation", "G.2 Transportation"], ["requirements", "G.3 Requirements"], ["adminCost", "G.4 Admin Cost"], ["thirdParty", "G.5 Third Party"], ["insurance", "G.6 Insurances"]],
  shopworks: [["accommodation", "E.1 Accommodation"], ["transportation", "E.2 Transportation"], ["requirements", "E.3 Requirements"], ["adminCost", "E.4 Admin Cost"], ["thirdParty", "E.5 Third Party"], ["insurance", "E.6 Insurances"]],
  supply: [["allowance", "D.1 Allowance"], ["transportation", "D.2 Transportation"], ["requirements", "E.3 Requirements"], ["adminCost", "E.4 Admin Cost"], ["thirdParty", "E.5 Third Party"], ["insurance", "E.6 Insurances"]]
};
const CE_TABS=[{id:"info",label:"Project Info"},{id:"sow",label:"Scope of Work"},{id:"sowbreak",label:"SOW Breakdown"},{id:"manpower",label:"Manpower"},{id:"tools",label:"Tools & Equipment"},{id:"materials",label:"Materials"},{id:"ppe",label:"PPE"},{id:"misc",label:"Miscellaneous"},{id:"summary",label:"Summary"},{id:"scopelib",label:"Scope Library"},{id:"masterlist",label:"Masterlist"},{id:"history",label:"CE Monitoring"},{id:"dashboard",label:"📊 Dashboard"}];
const DEFAULT_ML={
  manpower:[
    {id:"m1",code:"SHIC-MP-001",category:"Electrical",role:"Electrical Supervisor",rate:1200,perDiem:0,uom:"Day"},
    {id:"m2",code:"SHIC-MP-002",category:"Electrical",role:"Electrician",rate:850,perDiem:0,uom:"Day"},
    {id:"m3",code:"SHIC-MP-003",category:"Electrical",role:"Instrumentation Tech",rate:1000,perDiem:0,uom:"Day"},
    {id:"m4",code:"SHIC-MP-004",category:"Mechanical",role:"Mechanical Supervisor",rate:1300,perDiem:0,uom:"Day"},
    {id:"m5",code:"SHIC-MP-005",category:"Mechanical",role:"Welder",rate:950,perDiem:0,uom:"Day"},
    {id:"m6",code:"SHIC-MP-006",category:"Mechanical",role:"Pipefitter",rate:900,perDiem:0,uom:"Day"},
    {id:"m7",code:"SHIC-MP-007",category:"Mechanical",role:"Rigger / Scaffolder",rate:800,perDiem:0,uom:"Day"},
    {id:"m8",code:"SHIC-MP-008",category:"General",role:"Foreman",rate:1100,perDiem:0,uom:"Day"},
    {id:"m9",code:"SHIC-MP-009",category:"General",role:"Safety Officer",rate:1050,perDiem:0,uom:"Day"},
    {id:"m10",code:"SHIC-MP-010",category:"General",role:"Helper / Laborer",rate:650,perDiem:0,uom:"Day"},
    {id:"m11",code:"SHIC-MP-011",category:"General",role:"Painter / Blaster",rate:850,perDiem:0,uom:"Day"},
    {id:"m12",code:"SHIC-MP-012",category:"Civil",role:"Civil Worker",rate:750,perDiem:0,uom:"Day"}
  ,
    {id:"mp13",code:"SHIC-MP-013",category:"General",role:"ADMIN",rate:850,perDiem:0,uom:"Day"},
    {id:"mp14",code:"SHIC-MP-014",category:"Electrical",role:"AUTOCAD OPERATOR",rate:900,perDiem:0,uom:"Day"},
    {id:"mp15",code:"SHIC-MP-015",category:"Mechanical",role:"BALANCING SUPERVISOR",rate:1500,perDiem:0,uom:"Day"},
    {id:"mp16",code:"SHIC-MP-016",category:"Mechanical",role:"BALANCING TECHNICIAN",rate:1200,perDiem:0,uom:"Day"},
    {id:"mp17",code:"SHIC-MP-017",category:"General",role:"BOILER INSPECTOR",rate:1400,perDiem:0,uom:"Day"},
    {id:"mp18",code:"SHIC-MP-018",category:"Mechanical",role:"BOILER WELDER",rate:1100,perDiem:0,uom:"Day"},
    {id:"mp19",code:"SHIC-MP-019",category:"General",role:"DOCUMENT CONTROLLER",rate:850,perDiem:0,uom:"Day"},
    {id:"mp20",code:"SHIC-MP-020",category:"General",role:"DRIVER",rate:750,perDiem:0,uom:"Day"},
    {id:"mp21",code:"SHIC-MP-021",category:"Electrical",role:"ELECTRICAL ENGINEER",rate:1500,perDiem:0,uom:"Day"},
    {id:"mp22",code:"SHIC-MP-022",category:"General",role:"FIRE WATCHER",rate:650,perDiem:0,uom:"Day"},
    {id:"mp23",code:"SHIC-MP-023",category:"Electrical",role:"INSTRUMENT TECHNICIAN",rate:1000,perDiem:0,uom:"Day"},
    {id:"mp24",code:"SHIC-MP-024",category:"Mechanical",role:"MACHINIST",rate:1050,perDiem:0,uom:"Day"},
    {id:"mp25",code:"SHIC-MP-025",category:"Mechanical",role:"MECHANICAL FITTER",rate:950,perDiem:0,uom:"Day"},
    {id:"mp26",code:"SHIC-MP-026",category:"Mechanical",role:"MECHANICAL TECHNICIAN",rate:1000,perDiem:0,uom:"Day"},
    {id:"mp27",code:"SHIC-MP-027",category:"Mechanical",role:"MILLWRIGHT",rate:1000,perDiem:0,uom:"Day"},
    {id:"mp28",code:"SHIC-MP-028",category:"General",role:"NDT TECHNICIAN",rate:1200,perDiem:0,uom:"Day"},
    {id:"mp29",code:"SHIC-MP-029",category:"General",role:"OVERHEAD CRANE OPERATOR",rate:900,perDiem:0,uom:"Day"},
    {id:"mp30",code:"SHIC-MP-030",category:"General",role:"PROCUREMENT OFFICER",rate:900,perDiem:0,uom:"Day"},
    {id:"mp31",code:"SHIC-MP-031",category:"General",role:"PROJECT MANAGER",rate:1800,perDiem:0,uom:"Day"},
    {id:"mp32",code:"SHIC-MP-032",category:"General",role:"QA/QC",rate:1200,perDiem:0,uom:"Day"},
    {id:"mp33",code:"SHIC-MP-033",category:"Mechanical",role:"RIGGER",rate:800,perDiem:0,uom:"Day"},
    {id:"mp34",code:"SHIC-MP-034",category:"General",role:"ROBOTIC OPERATOR",rate:1500,perDiem:0,uom:"Day"},
    {id:"mp35",code:"SHIC-MP-035",category:"General",role:"SAFETY OFFICER 3",rate:1050,perDiem:0,uom:"Day"},
    {id:"mp36",code:"SHIC-MP-036",category:"General",role:"SANDBLASTER",rate:850,perDiem:0,uom:"Day"},
    {id:"mp37",code:"SHIC-MP-037",category:"General",role:"SANDBLASTING SUPERVISOR",rate:1100,perDiem:0,uom:"Day"},
    {id:"mp38",code:"SHIC-MP-038",category:"Mechanical",role:"SCAFFOLDER",rate:800,perDiem:0,uom:"Day"},
    {id:"mp39",code:"SHIC-MP-039",category:"General",role:"SUPERVISOR",rate:1300,perDiem:0,uom:"Day"},
    {id:"mp40",code:"SHIC-MP-040",category:"General",role:"TOOL KEEPER",rate:700,perDiem:0,uom:"Day"},
    {id:"mp41",code:"SHIC-MP-041",category:"General",role:"TRADE ASSISTANT",rate:700,perDiem:0,uom:"Day"},
    {id:"mp42",code:"SHIC-MP-042",category:"General",role:"TRADE BLASTER",rate:750,perDiem:0,uom:"Day"},
    {id:"mp43",code:"SHIC-MP-043",category:"Mechanical",role:"TRADE MACHINIST",rate:1000,perDiem:0,uom:"Day"}],
  tools:[
    {id:"t1",code:"SHIC-TL-001",category:"Measuring & Precision Instruments",desc:"Multimeter / Clamp Meter",cost:500,uom:"Day"},
    {id:"t2",code:"SHIC-TL-002",category:"NDT & Testing Equipment",desc:"Megger / Insulation Tester",cost:800,uom:"Day"},
    {id:"t3",code:"SHIC-TL-003",category:"Electrical & Power Supply",desc:"Cable Pulling Machine",cost:2500,uom:"Day"},
    {id:"t4",code:"SHIC-TL-004",category:"Power Tools",desc:"Power Tools Set",cost:1200,uom:"Day"},
    {id:"t5",code:"SHIC-TL-005",category:"Welding & Cutting Equipment",desc:"Welding Machine (SMAW)",cost:1500,uom:"Day"},
    {id:"t6",code:"SHIC-TL-006",category:"Power Tools",desc:"Grinding Machine",cost:600,uom:"Day"},
    {id:"t7",code:"SHIC-TL-007",category:"Torque & Tensioning Tools",desc:"Torque Wrench Set",cost:700,uom:"Day"},
    {id:"t8",code:"SHIC-TL-008",category:"Site Support & Safety",desc:"Safety Harness & Lanyard",cost:300,uom:"Day"},
    {id:"t9",code:"SHIC-TL-009",category:"Scaffolding & Access",desc:"Scaffolding (per bay)",cost:500,uom:"Day"},
    {id:"t10",code:"SHIC-TL-010",category:"Electrical & Power Supply",desc:"Generator (5 kVA)",cost:2000,uom:"Day"},
    {id:"t11",code:"SHIC-TL-011",category:"Machining Equipment",desc:"Pipe Threader",cost:800,uom:"Day"},
    {id:"t12",code:"SHIC-TL-012",category:"Hand Tools",desc:"Conduit Bender",cost:600,uom:"Day"}
  ,
    {id:"tl13",code:"SHIC-TL-013",category:"Welding & Cutting Equipment",desc:"AIR CARBON ARC GOUGING SET",cost:500,uom:"Day"},
    {id:"tl14",code:"SHIC-TL-014",category:"Pneumatic Tools",desc:"AIR COMPRESSOR 3HP",cost:600,uom:"Day"},
    {id:"tl15",code:"SHIC-TL-015",category:"Power Tools",desc:"ANGLE GRINDER 4\"",cost:200,uom:"Day"},
    {id:"tl16",code:"SHIC-TL-016",category:"Power Tools",desc:"ANGLE GRINDER 7\"",cost:300,uom:"Day"},
    {id:"tl17",code:"SHIC-TL-017",category:"Specialized Repair Tooling",desc:"BABBITT CASTING CENTRIFUGE",cost:2000,uom:"Day"},
    {id:"tl18",code:"SHIC-TL-018",category:"Specialized Repair Tooling",desc:"BABBITT MELTER POT",cost:500,uom:"Day"},
    {id:"tl19",code:"SHIC-TL-019",category:"Alignment & Balancing Equipment",desc:"BALANCING MACHINE",cost:5000,uom:"Day"},
    {id:"tl20",code:"SHIC-TL-020",category:"Surface Preparation & Coating",desc:"BLASTING NOZZLE 6 3/8\"",cost:200,uom:"Day"},
    {id:"tl21",code:"SHIC-TL-021",category:"Measuring & Precision Instruments",desc:"BORE GAUGE 50-150MM",cost:300,uom:"Day"},
    {id:"tl22",code:"SHIC-TL-022",category:"Surface Preparation & Coating",desc:"CERAMIC COATING SPRAY EQUIPMENT",cost:3000,uom:"Day"},
    {id:"tl23",code:"SHIC-TL-023",category:"Lifting & Rigging",desc:"CHAIN BLOCK 10T",cost:500,uom:"Day"},
    {id:"tl24",code:"SHIC-TL-024",category:"Lifting & Rigging",desc:"CHAIN BLOCK 5T",cost:300,uom:"Day"},
    {id:"tl25",code:"SHIC-TL-025",category:"Hand Tools",desc:"CHIPPING HAMMER",cost:100,uom:"Day"},
    {id:"tl26",code:"SHIC-TL-026",category:"Measuring & Precision Instruments",desc:"CLAMP TESTER",cost:300,uom:"Day"},
    {id:"tl27",code:"SHIC-TL-027",category:"Welding & Cutting Equipment",desc:"COLD METAL TRANSFER (CMT)",cost:5000,uom:"Day"},
    {id:"tl28",code:"SHIC-TL-028",category:"Hand Tools",desc:"COMBINATION PLIER 8\"",cost:100,uom:"Day"},
    {id:"tl29",code:"SHIC-TL-029",category:"Hand Tools",desc:"COMBINATION WRENCH (8-32MM)",cost:150,uom:"Day"},
    {id:"tl30",code:"SHIC-TL-030",category:"NDT & Testing Equipment",desc:"DEMAGNETIZATION MACHINE",cost:1500,uom:"Day"},
    {id:"tl31",code:"SHIC-TL-031",category:"NDT & Testing Equipment",desc:"DEWPOINT METER",cost:800,uom:"Day"},
    {id:"tl32",code:"SHIC-TL-032",category:"Alignment & Balancing Equipment",desc:"DIAL INDICATOR W/ MAGNETIC STAND",cost:300,uom:"Day"},
    {id:"tl33",code:"SHIC-TL-033",category:"Welding & Cutting Equipment",desc:"DIESEL WELDING MACHINE",cost:1500,uom:"Day"},
    {id:"tl34",code:"SHIC-TL-034",category:"Site Support & Safety",desc:"DIGITAL CAMERA",cost:300,uom:"Day"},
    {id:"tl35",code:"SHIC-TL-035",category:"NDT & Testing Equipment",desc:"DIGITAL PSYCHROMETER",cost:500,uom:"Day"},
    {id:"tl36",code:"SHIC-TL-036",category:"Measuring & Precision Instruments",desc:"DIGITAL SURFACE PROFILE GAUGE",cost:800,uom:"Day"},
    {id:"tl37",code:"SHIC-TL-037",category:"Measuring & Precision Instruments",desc:"DIGITAL VERNIER CALIPER 0-300MM",cost:300,uom:"Day"},
    {id:"tl38",code:"SHIC-TL-038",category:"NDT & Testing Equipment",desc:"ELCID TEST EQUIPMENT",cost:8000,uom:"Day"},
    {id:"tl39",code:"SHIC-TL-039",category:"Measuring & Precision Instruments",desc:"ELCOMETER THICKNESS GAUGE",cost:800,uom:"Day"},
    {id:"tl40",code:"SHIC-TL-040",category:"NDT & Testing Equipment",desc:"ELECTROMAGNETIC YOKE",cost:800,uom:"Day"},
    {id:"tl41",code:"SHIC-TL-041",category:"Specialized Repair Tooling",desc:"FABRICATED JIGS",cost:500,uom:"Day"},
    {id:"tl42",code:"SHIC-TL-042",category:"Measuring & Precision Instruments",desc:"FEELER GAUGE LONG SERIES",cost:200,uom:"Day"},
    {id:"tl43",code:"SHIC-TL-043",category:"Electrical & Power Supply",desc:"FLOOD LIGHT 1000W",cost:500,uom:"Day"},
    {id:"tl44",code:"SHIC-TL-044",category:"Electrical & Power Supply",desc:"FLOOD LIGHT 100W",cost:200,uom:"Day"},
    {id:"tl45",code:"SHIC-TL-045",category:"NDT & Testing Equipment",desc:"GAUSS METER",cost:800,uom:"Day"},
    {id:"tl46",code:"SHIC-TL-046",category:"NDT & Testing Equipment",desc:"HARDNESS TESTER",cost:1000,uom:"Day"},
    {id:"tl47",code:"SHIC-TL-047",category:"NDT & Testing Equipment",desc:"HARDNESS TESTER (PORTABLE)",cost:1000,uom:"Day"},
    {id:"tl48",code:"SHIC-TL-048",category:"Surface Preparation & Coating",desc:"HEAT GUN",cost:300,uom:"Day"},
    {id:"tl49",code:"SHIC-TL-049",category:"Welding & Cutting Equipment",desc:"HEATING TORCH",cost:300,uom:"Day"},
    {id:"tl50",code:"SHIC-TL-050",category:"Lifting & Rigging",desc:"HYDRAULIC JACK 20T",cost:600,uom:"Day"},
    {id:"tl51",code:"SHIC-TL-051",category:"Lifting & Rigging",desc:"HYDRAULIC JACK 50T",cost:1000,uom:"Day"},
    {id:"tl52",code:"SHIC-TL-052",category:"Torque & Tensioning Tools",desc:"HYDRAULIC TORQUE WRENCH",cost:1500,uom:"Day"},
    {id:"tl53",code:"SHIC-TL-053",category:"Measuring & Precision Instruments",desc:"HYDROSTATIC PRESSURE TEST PUMP",cost:1500,uom:"Day"},
    {id:"tl54",code:"SHIC-TL-054",category:"Specialized Repair Tooling",desc:"INDUCTION HEATER",cost:2000,uom:"Day"},
    {id:"tl55",code:"SHIC-TL-055",category:"Site Support & Safety",desc:"INDUSTRIAL BLOWER WITH DUCTING",cost:800,uom:"Day"},
    {id:"tl56",code:"SHIC-TL-056",category:"Measuring & Precision Instruments",desc:"INSIDE MICROMETER 50-1500MM",cost:400,uom:"Day"},
    {id:"tl57",code:"SHIC-TL-057",category:"Welding & Cutting Equipment",desc:"INVERTER WELDING MACHINE",cost:1000,uom:"Day"},
    {id:"tl58",code:"SHIC-TL-058",category:"Site Support & Safety",desc:"LAPTOP / DATA LOGGER",cost:500,uom:"Day"},
    {id:"tl59",code:"SHIC-TL-059",category:"Alignment & Balancing Equipment",desc:"LASER ALIGNMENT",cost:3000,uom:"Day"},
    {id:"tl60",code:"SHIC-TL-060",category:"Machining Equipment",desc:"LATHE MACHINE",cost:3000,uom:"Day"},
    {id:"tl61",code:"SHIC-TL-061",category:"On-Site Machining Equipment",desc:"LINE BORING MACHINE",cost:5000,uom:"Day"},
    {id:"tl62",code:"SHIC-TL-062",category:"Power Tools",desc:"MAGNETIC DRILL",cost:800,uom:"Day"},
    {id:"tl63",code:"SHIC-TL-063",category:"Measuring & Precision Instruments",desc:"METER TAPE",cost:50,uom:"Day"},
    {id:"tl64",code:"SHIC-TL-064",category:"Measuring & Precision Instruments",desc:"METER TAPE 8M",cost:50,uom:"Day"},
    {id:"tl65",code:"SHIC-TL-065",category:"Welding & Cutting Equipment",desc:"MILLER 300 / TIG WELD",cost:1500,uom:"Day"},
    {id:"tl66",code:"SHIC-TL-066",category:"Machining Equipment",desc:"MILLING MACHINE",cost:3000,uom:"Day"},
    {id:"tl67",code:"SHIC-TL-067",category:"Machining Equipment",desc:"MILLING MACHINE SMALL",cost:1500,uom:"Day"},
    {id:"tl68",code:"SHIC-TL-068",category:"NDT & Testing Equipment",desc:"MPI MACHINE",cost:2000,uom:"Day"},
    {id:"tl69",code:"SHIC-TL-069",category:"Measuring & Precision Instruments",desc:"MULTI TESTER",cost:200,uom:"Day"},
    {id:"tl70",code:"SHIC-TL-070",category:"Lifting & Rigging",desc:"NYLON SLING 10T X 8M",cost:300,uom:"Day"},
    {id:"tl71",code:"SHIC-TL-071",category:"Lifting & Rigging",desc:"NYLON SLING 5T X 5M",cost:200,uom:"Day"},
    {id:"tl72",code:"SHIC-TL-072",category:"Measuring & Precision Instruments",desc:"OUTSIDE MICROMETER 0-150MM",cost:300,uom:"Day"},
    {id:"tl73",code:"SHIC-TL-073",category:"Measuring & Precision Instruments",desc:"OUTSIDE MICROMETER 0-25MM",cost:200,uom:"Day"},
    {id:"tl74",code:"SHIC-TL-074",category:"Lifting & Rigging",desc:"OVERHEAD CRANE 40T",cost:5000,uom:"Day"},
    {id:"tl75",code:"SHIC-TL-075",category:"Measuring & Precision Instruments",desc:"PI TAPE",cost:200,uom:"Day"},
    {id:"tl76",code:"SHIC-TL-076",category:"Welding & Cutting Equipment",desc:"PLASMA CUTTER",cost:1500,uom:"Day"},
    {id:"tl77",code:"SHIC-TL-077",category:"NDT & Testing Equipment",desc:"PMI MACHINE",cost:3000,uom:"Day"},
    {id:"tl78",code:"SHIC-TL-078",category:"NDT & Testing Equipment",desc:"PMI MACHINE (XRF ANALYZER)",cost:3000,uom:"Day"},
    {id:"tl79",code:"SHIC-TL-079",category:"Pneumatic Tools",desc:"PNEUMATIC ANGLE GRINDER 4\"",cost:400,uom:"Day"},
    {id:"tl80",code:"SHIC-TL-080",category:"Pneumatic Tools",desc:"PNEUMATIC CHIPPING HAMMER",cost:300,uom:"Day"},
    {id:"tl81",code:"SHIC-TL-081",category:"On-Site Machining Equipment",desc:"PORTABLE LATHE / TURNING DEVICE",cost:5000,uom:"Day"},
    {id:"tl82",code:"SHIC-TL-082",category:"Measuring & Precision Instruments",desc:"PRESSURE GAUGE",cost:200,uom:"Day"},
    {id:"tl83",code:"SHIC-TL-083",category:"Welding & Cutting Equipment",desc:"PWHT MACHINE",cost:3000,uom:"Day"},
    {id:"tl84",code:"SHIC-TL-084",category:"NDT & Testing Equipment",desc:"REFERENCE BLOCK SET",cost:500,uom:"Day"},
    {id:"tl85",code:"SHIC-TL-085",category:"NDT & Testing Equipment",desc:"ROBOTIC INSPECTION CRAWLER",cost:10000,uom:"Day"},
    {id:"tl86",code:"SHIC-TL-086",category:"Specialized Repair Tooling",desc:"ROTOR STAND",cost:500,uom:"Day"},
    {id:"tl87",code:"SHIC-TL-087",category:"NDT & Testing Equipment",desc:"ROUGHNESS TESTER",cost:800,uom:"Day"},
    {id:"tl88",code:"SHIC-TL-088",category:"NDT & Testing Equipment",desc:"ROUGHNESS TESTER (PORTABLE)",cost:800,uom:"Day"},
    {id:"tl89",code:"SHIC-TL-089",category:"Hand Tools",desc:"RUBBER MALLET 32 OZ",cost:100,uom:"Day"},
    {id:"tl90",code:"SHIC-TL-090",category:"Surface Preparation & Coating",desc:"SANDBLASTING AIR COMPRESSOR",cost:2000,uom:"Day"},
    {id:"tl91",code:"SHIC-TL-091",category:"Surface Preparation & Coating",desc:"SANDBLASTING AIR MANIFOLD",cost:300,uom:"Day"},
    {id:"tl92",code:"SHIC-TL-092",category:"Surface Preparation & Coating",desc:"SANDBLASTING AIR TANK",cost:300,uom:"Day"},
    {id:"tl93",code:"SHIC-TL-093",category:"Surface Preparation & Coating",desc:"SANDBLASTING BLASTING POT",cost:1000,uom:"Day"},
    {id:"tl94",code:"SHIC-TL-094",category:"Surface Preparation & Coating",desc:"SANDBLASTING BLOWER 24\" WITH DUCT",cost:800,uom:"Day"},
    {id:"tl95",code:"SHIC-TL-095",category:"Surface Preparation & Coating",desc:"SANDBLASTING MACHINE",cost:2000,uom:"Day"},
    {id:"tl96",code:"SHIC-TL-096",category:"Surface Preparation & Coating",desc:"SANDBLASTING PNEUMATIC VACUUM",cost:800,uom:"Day"},
    {id:"tl97",code:"SHIC-TL-097",category:"Lifting & Rigging",desc:"SCAFFOLDING ADJUSTABLE BASE JACK",cost:100,uom:"Day"},
    {id:"tl98",code:"SHIC-TL-098",category:"Scaffolding & Access",desc:"SCAFFOLDING H-FRAME",cost:150,uom:"Day"},
    {id:"tl99",code:"SHIC-TL-099",category:"Scaffolding & Access",desc:"SCAFFOLDING PIPE SCH 40 1-1/2\"",cost:100,uom:"Day"},
    {id:"tl100",code:"SHIC-TL-100",category:"Specialized Repair Tooling",desc:"SCREW EXTRACTOR SET",cost:200,uom:"Day"},
    {id:"tl101",code:"SHIC-TL-101",category:"Lifting & Rigging",desc:"SHACKLE 1\"",cost:100,uom:"Day"},
    {id:"tl102",code:"SHIC-TL-102",category:"NDT & Testing Equipment",desc:"SINGLE CRYSTAL PROBE 10MHZ",cost:500,uom:"Day"},
    {id:"tl103",code:"SHIC-TL-103",category:"NDT & Testing Equipment",desc:"SINGLE CRYSTAL PROBE 2.25MHZ",cost:500,uom:"Day"},
    {id:"tl104",code:"SHIC-TL-104",category:"NDT & Testing Equipment",desc:"SINGLE CRYSTAL PROBE 5MHZ",cost:500,uom:"Day"},
    {id:"tl105",code:"SHIC-TL-105",category:"NDT & Testing Equipment",desc:"SINGLE CRYSTAL PROBE SET",cost:1500,uom:"Day"},
    {id:"tl106",code:"SHIC-TL-106",category:"Alignment & Balancing Equipment",desc:"STATIC BALANCING STAND",cost:2000,uom:"Day"},
    {id:"tl107",code:"SHIC-TL-107",category:"NDT & Testing Equipment",desc:"SURFACE COMPARATOR",cost:300,uom:"Day"},
    {id:"tl108",code:"SHIC-TL-108",category:"Power Tools",desc:"SURFACE GRINDER",cost:2000,uom:"Day"},
    {id:"tl109",code:"SHIC-TL-109",category:"Measuring & Precision Instruments",desc:"TEMPERATURE GUN",cost:200,uom:"Day"},
    {id:"tl110",code:"SHIC-TL-110",category:"Surface Preparation & Coating",desc:"THERMAL SPRAY MACHINE",cost:5000,uom:"Day"},
    {id:"tl111",code:"SHIC-TL-111",category:"Measuring & Precision Instruments",desc:"THERMOCOUPLE READER",cost:500,uom:"Day"},
    {id:"tl112",code:"SHIC-TL-112",category:"Specialized Repair Tooling",desc:"TIN MELTER POT",cost:300,uom:"Day"},
    {id:"tl113",code:"SHIC-TL-113",category:"Torque & Tensioning Tools",desc:"TORQUE WRENCH 1/2\"",cost:300,uom:"Day"},
    {id:"tl114",code:"SHIC-TL-114",category:"Torque & Tensioning Tools",desc:"TORQUE WRENCH 3/4\"",cost:500,uom:"Day"},
    {id:"tl115",code:"SHIC-TL-115",category:"NDT & Testing Equipment",desc:"ULTRASONIC THICKNESS GAUGE",cost:1000,uom:"Day"},
    {id:"tl116",code:"SHIC-TL-116",category:"NDT & Testing Equipment",desc:"UT MACHINE",cost:2000,uom:"Day"},
    {id:"tl117",code:"SHIC-TL-117",category:"NDT & Testing Equipment",desc:"UV FLASHLIGHT",cost:200,uom:"Day"},
    {id:"tl118",code:"SHIC-TL-118",category:"NDT & Testing Equipment",desc:"UV LAMP",cost:500,uom:"Day"},
    {id:"tl119",code:"SHIC-TL-119",category:"Measuring & Precision Instruments",desc:"VERNIER CALIPER 0 -150 MM",cost:150,uom:"Day"},
    {id:"tl120",code:"SHIC-TL-120",category:"NDT & Testing Equipment",desc:"VIBRATION ANALYZER",cost:2000,uom:"Day"}],
  materials:[
    {id:"mat1",code:"SHIC-MT-001",category:"Electrical",desc:"THHN Wire #14 AWG",cost:18,uom:"M"},
    {id:"mat2",code:"SHIC-MT-002",category:"Electrical",desc:"THHN Wire #12 AWG",cost:25,uom:"M"},
    {id:"mat3",code:"SHIC-MT-003",category:"Electrical",desc:"XLPE Cable 3.5C-5.5mm2",cost:180,uom:"M"},
    {id:"mat4",code:"SHIC-MT-004",category:"Electrical",desc:"XLPE Cable 3.5C-35mm2",cost:650,uom:"M"},
    {id:"mat5",code:"SHIC-MT-005",category:"Electrical",desc:'RSC Conduit 1/2"',cost:120,uom:"Pcs"},
    {id:"mat6",code:"SHIC-MT-006",category:"Electrical",desc:"Circuit Breaker 20A 1P",cost:350,uom:"Pcs"},
    {id:"mat7",code:"SHIC-MT-007",category:"Electrical",desc:"Cable Tray 600mm x 3m",cost:1200,uom:"Pcs"},
    {id:"mat8",code:"SHIC-MT-008",category:"Mechanical",desc:'G.I. Pipe Sch 40 1"',cost:480,uom:"M"},
    {id:"mat9",code:"SHIC-MT-009",category:"Mechanical",desc:'Stainless Pipe 1" Sch 10',cost:650,uom:"M"},
    {id:"mat10",code:"SHIC-MT-010",category:"Mechanical",desc:"Welding Rod E6013",cost:180,uom:"Kg"},
    {id:"mat11",code:"SHIC-MT-011",category:"Mechanical",desc:"Bolt & Nut Set",cost:250,uom:"Set"},
    {id:"mat12",code:"SHIC-MT-012",category:"General",desc:"Paint & Primer Set",cost:800,uom:"Set"}
  ,
    {id:"mt13",code:"SHIC-MT-013",category:"Mechanical",desc:"ACETYLENE",cost:800,uom:"Lot"},
    {id:"mt14",code:"SHIC-MT-014",category:"Mechanical",desc:"ALUMINUM OXIDE #180",cost:600,uom:"Lot"},
    {id:"mt15",code:"SHIC-MT-015",category:"Mechanical",desc:"ARALDITE 2014-2 / ADHESIVE EPOXY",cost:500,uom:"Lot"},
    {id:"mt16",code:"SHIC-MT-016",category:"Mechanical",desc:"ARGON",cost:700,uom:"Lot"},
    {id:"mt17",code:"SHIC-MT-017",category:"Mechanical",desc:"BABBITT METAL",cost:3000,uom:"Lot"},
    {id:"mt18",code:"SHIC-MT-018",category:"Mechanical",desc:"BRASS BRUSH",cost:150,uom:"Lot"},
    {id:"mt19",code:"SHIC-MT-019",category:"Mechanical",desc:"BROWN FUSE ALUMINA #180",cost:500,uom:"Lot"},
    {id:"mt20",code:"SHIC-MT-020",category:"Mechanical",desc:"CARBON ELECTRODE RODS",cost:400,uom:"Lot"},
    {id:"mt21",code:"SHIC-MT-021",category:"Mechanical",desc:"CAUTION TAPE",cost:80,uom:"Lot"},
    {id:"mt22",code:"SHIC-MT-022",category:"Mechanical",desc:"CEMENT",cost:300,uom:"Lot"},
    {id:"mt23",code:"SHIC-MT-023",category:"Mechanical",desc:"CERAMIC COATING MATERIAL",cost:5000,uom:"Lot"},
    {id:"mt24",code:"SHIC-MT-024",category:"Mechanical",desc:"CERAMIC PAPER",cost:800,uom:"Lot"},
    {id:"mt25",code:"SHIC-MT-025",category:"Mechanical",desc:"CLEANER",cost:300,uom:"Lot"},
    {id:"mt26",code:"SHIC-MT-026",category:"Mechanical",desc:"CLEANER (MR. CHEMIE)",cost:400,uom:"Lot"},
    {id:"mt27",code:"SHIC-MT-027",category:"Mechanical",desc:"CMT ACCESSORIES",cost:2000,uom:"Lot"},
    {id:"mt28",code:"SHIC-MT-028",category:"Mechanical",desc:"COOLANT CUTTING OIL",cost:500,uom:"Lot"},
    {id:"mt29",code:"SHIC-MT-029",category:"Mechanical",desc:"COPPER PLATE(*Size)",cost:1500,uom:"Lot"},
    {id:"mt30",code:"SHIC-MT-030",category:"Mechanical",desc:"COUPLANT GEL",cost:350,uom:"Lot"},
    {id:"mt31",code:"SHIC-MT-031",category:"Mechanical",desc:"CUTTING DISC 4\"",cost:120,uom:"Lot"},
    {id:"mt32",code:"SHIC-MT-032",category:"Mechanical",desc:"DEGREASER",cost:400,uom:"Lot"},
    {id:"mt33",code:"SHIC-MT-033",category:"Mechanical",desc:"DEVELOPER",cost:500,uom:"Lot"},
    {id:"mt34",code:"SHIC-MT-034",category:"Mechanical",desc:"DEVELOPER (MR. CHEMIE)",cost:600,uom:"Lot"},
    {id:"mt35",code:"SHIC-MT-035",category:"Mechanical",desc:"DUCT TAPE 2\"",cost:100,uom:"Lot"},
    {id:"mt36",code:"SHIC-MT-036",category:"Mechanical",desc:"EMERY CLOTH 1000 GRIT",cost:200,uom:"Lot"},
    {id:"mt37",code:"SHIC-MT-037",category:"Mechanical",desc:"EMERY CLOTH 400 GRIT",cost:150,uom:"Lot"},
    {id:"mt38",code:"SHIC-MT-038",category:"Mechanical",desc:"EMERY CLOTH 600 GRIT",cost:150,uom:"Lot"},
    {id:"mt39",code:"SHIC-MT-039",category:"Mechanical",desc:"EMERY CLOTH 800 GRIT",cost:150,uom:"Lot"},
    {id:"mt40",code:"SHIC-MT-040",category:"Mechanical",desc:"EPOXY REDUCER",cost:400,uom:"Lot"},
    {id:"mt41",code:"SHIC-MT-041",category:"Mechanical",desc:"FIRE BLANKET 1.2X1.2M",cost:800,uom:"Lot"},
    {id:"mt42",code:"SHIC-MT-042",category:"Mechanical",desc:"FLEXIBLE DISC 4\"",cost:150,uom:"Lot"},
    {id:"mt43",code:"SHIC-MT-043",category:"Mechanical",desc:"GLASS BEAD #5",cost:500,uom:"Lot"},
    {id:"mt44",code:"SHIC-MT-044",category:"Mechanical",desc:"GRINDING DISC 4\"",cost:100,uom:"Lot"},
    {id:"mt45",code:"SHIC-MT-045",category:"Mechanical",desc:"HARDFACING WELDING ROD",cost:1500,uom:"Lot"},
    {id:"mt46",code:"SHIC-MT-046",category:"Mechanical",desc:"HYDRAULIC OIL 68",cost:600,uom:"Lot"},
    {id:"mt47",code:"SHIC-MT-047",category:"Mechanical",desc:"ISOWOOL",cost:1000,uom:"Lot"},
    {id:"mt48",code:"SHIC-MT-048",category:"Mechanical",desc:"ITEM TO BE SUPPLIED",cost:500,uom:"Lot"},
    {id:"mt49",code:"SHIC-MT-049",category:"Mechanical",desc:"LOCTITE ANTI-SEIZE",cost:400,uom:"Lot"},
    {id:"mt50",code:"SHIC-MT-050",category:"Mechanical",desc:"LPG",cost:600,uom:"Lot"},
    {id:"mt51",code:"SHIC-MT-051",category:"Mechanical",desc:"MAGNAFLUX 20B",cost:800,uom:"Lot"},
    {id:"mt52",code:"SHIC-MT-052",category:"Mechanical",desc:"MAGNAFLUX 20B (MAGNETIC PARTICLE POWDER)",cost:1200,uom:"Lot"},
    {id:"mt53",code:"SHIC-MT-053",category:"Mechanical",desc:"MARFAK GREASE 500G",cost:400,uom:"Lot"},
    {id:"mt54",code:"SHIC-MT-054",category:"Mechanical",desc:"MARPAK",cost:300,uom:"Lot"},
    {id:"mt55",code:"SHIC-MT-055",category:"Mechanical",desc:"MASKING TAPE 2\"",cost:80,uom:"Lot"},
    {id:"mt56",code:"SHIC-MT-056",category:"Mechanical",desc:"OXYGEN",cost:600,uom:"Lot"},
    {id:"mt57",code:"SHIC-MT-057",category:"Mechanical",desc:"PAINT MARKER (YELLOW/WHITE)",cost:100,uom:"Lot"},
    {id:"mt58",code:"SHIC-MT-058",category:"Mechanical",desc:"PENETRANT",cost:500,uom:"Lot"},
    {id:"mt59",code:"SHIC-MT-059",category:"Mechanical",desc:"PENETRANT (MR. CHEMIE)",cost:600,uom:"Lot"},
    {id:"mt60",code:"SHIC-MT-060",category:"Mechanical",desc:"PENETRANT CARRIER OIL",cost:400,uom:"Lot"},
    {id:"mt61",code:"SHIC-MT-061",category:"Mechanical",desc:"PLASTER OF PARIS",cost:200,uom:"Lot"},
    {id:"mt62",code:"SHIC-MT-062",category:"Mechanical",desc:"QUICK CHANGE DISC GRIT 80 3\"",cost:200,uom:"Lot"},
    {id:"mt63",code:"SHIC-MT-063",category:"Mechanical",desc:"RAGS ASSORTED",cost:200,uom:"Lot"},
    {id:"mt64",code:"SHIC-MT-064",category:"Mechanical",desc:"RAGS ROUND WHITE",cost:200,uom:"Lot"},
    {id:"mt65",code:"SHIC-MT-065",category:"Mechanical",desc:"ROLOC 3M 777F 80G",cost:300,uom:"Lot"},
    {id:"mt66",code:"SHIC-MT-066",category:"Mechanical",desc:"SACK BIG",cost:100,uom:"Lot"},
    {id:"mt67",code:"SHIC-MT-067",category:"Mechanical",desc:"SANDPAPER 120G",cost:100,uom:"Lot"},
    {id:"mt68",code:"SHIC-MT-068",category:"Mechanical",desc:"SOLDERING FLUX",cost:200,uom:"Lot"},
    {id:"mt69",code:"SHIC-MT-069",category:"Mechanical",desc:"STEEL BRUSH MEDIUM",cost:150,uom:"Lot"},
    {id:"mt70",code:"SHIC-MT-070",category:"Mechanical",desc:"STELLITE 6 ROD / WIRE",cost:3000,uom:"Lot"},
    {id:"mt71",code:"SHIC-MT-071",category:"Mechanical",desc:"STRETCH FILM",cost:200,uom:"Lot"},
    {id:"mt72",code:"SHIC-MT-072",category:"Mechanical",desc:"THERMAL SPRAY WIRE/POWEDER",cost:3000,uom:"Lot"},
    {id:"mt73",code:"SHIC-MT-073",category:"Mechanical",desc:"THERMOCOUPLE WIRE",cost:500,uom:"Lot"},
    {id:"mt74",code:"SHIC-MT-074",category:"Electrical",desc:"TIE WIRE #18",cost:100,uom:"Lot"},
    {id:"mt75",code:"SHIC-MT-075",category:"Mechanical",desc:"TIN INGGOT",cost:1500,uom:"Lot"},
    {id:"mt76",code:"SHIC-MT-076",category:"Mechanical",desc:"TIN PASTE",cost:400,uom:"Lot"},
    {id:"mt77",code:"SHIC-MT-077",category:"Mechanical",desc:"TUNGATIP",cost:300,uom:"Lot"},
    {id:"mt78",code:"SHIC-MT-078",category:"Mechanical",desc:"WD-40 382ML",cost:250,uom:"Lot"},
    {id:"mt79",code:"SHIC-MT-079",category:"Mechanical",desc:"WELDING ROD 6013 3.2MM",cost:500,uom:"Lot"},
    {id:"mt80",code:"SHIC-MT-080",category:"Mechanical",desc:"WELDING ROD 7018 3.2MM",cost:600,uom:"Lot"},
    {id:"mt81",code:"SHIC-MT-081",category:"Mechanical",desc:"WELDING WIRE ER120S",cost:800,uom:"Lot"}],
  ppe:[
    {id:"p1",code:"SHIC-PP-001",category:"General",desc:"Hard Hat",cost:280,uom:"Pcs"},
    {id:"p2",code:"SHIC-PP-002",category:"General",desc:"Safety Shoes",cost:950,uom:"Pair"},
    {id:"p3",code:"SHIC-PP-003",category:"General",desc:"Safety Goggles",cost:180,uom:"Pcs"},
    {id:"p4",code:"SHIC-PP-004",category:"General",desc:"Work Gloves",cost:120,uom:"Pair"},
    {id:"p5",code:"SHIC-PP-005",category:"General",desc:"High-vis Vest",cost:150,uom:"Pcs"},
    {id:"p6",code:"SHIC-PP-006",category:"General",desc:"Face Shield",cost:220,uom:"Pcs"},
    {id:"p7",code:"SHIC-PP-007",category:"Welding",desc:"Welding Mask Auto-Dark",cost:1800,uom:"Pcs"},
    {id:"p8",code:"SHIC-PP-008",category:"Welding",desc:"Welding Gloves",cost:250,uom:"Pair"},
    {id:"p9",code:"SHIC-PP-009",category:"Welding",desc:"Leather Apron",cost:600,uom:"Pcs"},
    {id:"p10",code:"SHIC-PP-010",category:"General",desc:"Ear Muff / Plugs",cost:80,uom:"Set"},
    {id:"p11",code:"SHIC-PP-011",category:"General",desc:"Dust Mask N95",cost:45,uom:"Pcs"},
    {id:"p12",code:"SHIC-PP-012",category:"General",desc:"Full Body Harness",cost:2200,uom:"Pcs"}
  ,
    {id:"pp13",code:"SHIC-PP-013",category:"General",desc:"BLASTING HOOD",cost:2500,uom:"Pcs"},
    {id:"pp14",code:"SHIC-PP-014",category:"General",desc:"BLASTING SUIT",cost:1800,uom:"Pcs"},
    {id:"pp15",code:"SHIC-PP-015",category:"General",desc:"CHEMICAL GLOVES",cost:350,uom:"Pcs"},
    {id:"pp16",code:"SHIC-PP-016",category:"General",desc:"COTTON HAND GLOVES",cost:80,uom:"Pcs"},
    {id:"pp17",code:"SHIC-PP-017",category:"General",desc:"COVERALL REFLECTORIZED",cost:600,uom:"Pcs"},
    {id:"pp18",code:"SHIC-PP-018",category:"General",desc:"EARPLUGS",cost:30,uom:"Pcs"},
    {id:"pp19",code:"SHIC-PP-019",category:"General",desc:"FIRST AID KIT",cost:800,uom:"Pcs"},
    {id:"pp20",code:"SHIC-PP-020",category:"General",desc:"FULL BODY HARNESS W/ LANYARD",cost:2500,uom:"Pcs"},
    {id:"pp21",code:"SHIC-PP-021",category:"General",desc:"HEAT-RESISTANT GLOVES",cost:400,uom:"Pcs"},
    {id:"pp22",code:"SHIC-PP-022",category:"General",desc:"HIGH VISIBILITY VEST",cost:250,uom:"Pcs"},
    {id:"pp23",code:"SHIC-PP-023",category:"General",desc:"RESPIRATOR FILTER",cost:200,uom:"Pcs"},
    {id:"pp24",code:"SHIC-PP-024",category:"General",desc:"SAFETY CLEAR GOGGLES",cost:150,uom:"Pcs"},
    {id:"pp25",code:"SHIC-PP-025",category:"General",desc:"SAFETY HELMET W/ CHIN STRAP",cost:350,uom:"Pcs"},
    {id:"pp26",code:"SHIC-PP-026",category:"General",desc:"TIG GLOVES",cost:300,uom:"Pcs"},
    {id:"pp27",code:"SHIC-PP-027",category:"General",desc:"WELDING APRON",cost:500,uom:"Pcs"},
    {id:"pp28",code:"SHIC-PP-028",category:"General",desc:"WELDING MASK",cost:800,uom:"Pcs"}],
  vehicles:[
    {id:"v1",code:"SHIC-VH-001",category:"Light Vehicle",desc:"Pickup Truck / Van",rate:2500,uom:"Day"},
    {id:"v2",code:"SHIC-VH-002",category:"Light Vehicle",desc:"Service Vehicle (Car)",rate:1800,uom:"Day"},
    {id:"v3",code:"SHIC-VH-003",category:"Light Vehicle",desc:"Motorcycle",rate:600,uom:"Day"},
    {id:"v4",code:"SHIC-VH-004",category:"Heavy Equipment",desc:"Boom Truck (3 Ton)",rate:8500,uom:"Day"},
    {id:"v5",code:"SHIC-VH-005",category:"Heavy Equipment",desc:"Crane (Mobile 10 Ton)",rate:18000,uom:"Day"},
    {id:"v6",code:"SHIC-VH-006",category:"Heavy Equipment",desc:"Forklift (3 Ton)",rate:7500,uom:"Day"},
    {id:"v7",code:"SHIC-VH-007",category:"Heavy Equipment",desc:"Backhoe / Excavator",rate:12000,uom:"Day"},
    {id:"v8",code:"SHIC-VH-008",category:"Truck",desc:"Flatbed Truck (6-Wheeler)",rate:9500,uom:"Day"},
    {id:"v9",code:"SHIC-VH-009",category:"Truck",desc:"Cargo Truck (4-Wheeler)",rate:6500,uom:"Day"},
    {id:"v10",code:"SHIC-VH-010",category:"Truck",desc:"Dump Truck",rate:8000,uom:"Day"},
    {id:"v11",code:"SHIC-VH-011",category:"Truck",desc:"Tanker Truck",rate:7500,uom:"Day"},
{id:"v12",code:"SHIC-VH-012",category:"Fuel",desc:"Diesel Fuel",rate:75,uom:"L"},
    {id:"v13",code:"SHIC-VH-013",category:"Allowance",desc:"Daily Allowance",rate:500,uom:"Day"},
    {id:"v14",code:"SHIC-VH-014",category:"Allowance",desc:"Meals / Incentive",rate:350,uom:"Day"},
    {id:"v15",code:"SHIC-VH-015",category:"Travel",desc:"Plane Ticket (Domestic)",rate:4500,uom:"Pcs"},
    {id:"v16",code:"SHIC-VH-016",category:"Travel",desc:"Ferry / Boat Ticket",rate:1200,uom:"Pcs"},
    {id:"v17",code:"SHIC-VH-017",category:"Travel",desc:"Bus Ticket",rate:400,uom:"Pcs"},
    {id:"v18",code:"SHIC-VH-018",category:"Travel",desc:"Toll Fees",rate:200,uom:"Day"},
    {id:"v19",code:"SHIC-VH-019",category:"Accommodation",desc:"Hotel / Lodging",rate:1500,uom:"Day"},
    {id:"v20",code:"SHIC-VH-020",category:"Personnel",desc:"Driver (w/ Vehicle)",rate:1500,uom:"Day"},
    {id:"v21",code:"SHIC-VH-021",category:"Personnel",desc:"Driver Only",rate:700,uom:"Day"},
    {id:"v22",code:"SHIC-VH-022",category:"Fuel",desc:"Gasoline",rate:65,uom:"L"},
    {id:"v23",code:"SHIC-VH-023",category:"Miscellaneous",desc:"Parking Fee",rate:150,uom:"Day"},
    {id:"v24",code:"SHIC-VH-024",category:"Miscellaneous",desc:"Handling / Porterage",rate:500,uom:"Day"}
  ]
};

/* 'Draft' and 'No Quote' were referenced by the app's own logic -- the Open CE
   rule, the dashboard donut and the xlsx import all name them -- but were
   missing from this list, so nobody could actually select them. */
const DEFAULT_STATUS_OPTIONS = ['Draft', 'Pending', 'Ongoing', 'For site insp.', 'For Approval', 'Waiting in...', 'Approved', 'Cancelled', 'On Hold', 'No Quote', 'Submitted'];

/* Two Status fields describe the same CE:

     Project Info  -> the DOCUMENT state printed on the estimate
                      (DRAFT / FOR REVIEW / APPROVED / REJECTED / REVISED)
     Monitoring    -> the PIPELINE state the sales team tracks
                      (Pending, Ongoing, Submitted, ...)

   They used to be entirely independent -- not one shared value between them,
   so the same CE could read APPROVED on the printed page and Cancelled in
   Monitoring. These tables keep them in step.

   The pipeline is the richer of the two, so several pipeline states map to one
   document state. 'On Hold' and any custom status have no document equivalent
   and deliberately map to nothing: they leave the document state alone rather
   than forcing it to a value that would misrepresent the estimate. */
const CE_DOC_STATUSES = ['DRAFT', 'FOR REVIEW', 'APPROVED', 'REJECTED', 'REVISED'];
const DOC_TO_MON = {
  'DRAFT': 'Draft',
  'FOR REVIEW': 'For Approval',
  'APPROVED': 'Approved',
  'REJECTED': 'Cancelled',
  'REVISED': 'Ongoing'
};
const MON_TO_DOC = {
  'Draft': 'DRAFT',
  'Pending': 'DRAFT',
  'Ongoing': 'REVISED',
  'For site insp.': 'FOR REVIEW',
  'For Approval': 'FOR REVIEW',
  'Waiting in...': 'FOR REVIEW',
  'Approved': 'APPROVED',
  'Submitted': 'APPROVED',
  'Cancelled': 'REJECTED',
  'No Quote': 'REJECTED'
};
/* ── Default notes and signatories, per CE type and discipline ───────────────
   The signatory roster and the notes used to be hardcoded in two places in
   App.js -- the initial state and handleNew -- so every CE started with the
   same five names regardless of who was estimating or what kind of job it was,
   and anything else had to be retyped every time.

   A preset is {id, ceType, discipline, notes:[...], approvers:[{role,name,title}]}.
   Either key may be ANY, which is how one roster covers everything and a
   specific pairing overrides it. */
/* Tools and equipment are filed by what they DO, not by which discipline
   happens to be using them. Electrical / Mechanical / General said almost
   nothing about a tool -- a torque wrench, a crane and a megger were all
   "Mechanical" or "General" -- so the category could not be searched, grouped
   or reported on, which is the whole point of having one.

   Kept alphabetical: the list is long enough that a reader scans for a word
   rather than reading it through, and any other order has to be learned.

   A tool filed under an older category keeps it. Nothing here re-files
   anything; the editors simply offer the row's own value alongside these. */
const TOOL_CATEGORIES = [
  'Alignment & Balancing Equipment',
  'Cutting Tools & Tooling Consumables',
  'Electrical & Power Supply',
  'Hand Tools',
  'Lifting & Rigging',
  'Machining Equipment',
  'Measuring & Precision Instruments',
  'NDT & Testing Equipment',
  'On-Site Machining Equipment',
  'Pneumatic Tools',
  'Power Tools',
  'Scaffolding & Access',
  'Site Support & Safety',
  'Specialized Repair Tooling',
  'Surface Preparation & Coating',
  'Torque & Tensioning Tools',
  'Vehicles & Heavy Equipment',
  'Welding & Cutting Equipment'
];

/* Materials offered Electrical / Mechanical / Civil / General -- the discipline
   list, borrowed. It says nothing about a material: every abrasive, gas,
   chemical and fastener in the warehouse landed in one of four buckets, so the
   Materials tab could not be filtered, searched by category, or reported on.

   These come from the warehouse export's own Category column, cleaned up: the
   "(INV)-WHD" suffix dropped, and the pairs the warehouse splits but a CE never
   does merged into one -- welding consumables with welding accessories, cutting
   with cutting, sandblasting with sandblasting, machining with turning.

   PPE and uniforms are deliberately absent. They have their own tab, and a
   material category that duplicates it only invites the same item being costed
   twice.

   Alphabetical, for the same reason as the tools. A material filed under an
   older category keeps it -- nothing here re-files anything. */
const MATERIAL_CATEGORIES = [
  'Abrasives & Grinding',
  'Air & Pneumatic Accessories',
  'Balancing Consumables',
  'Cleaning Chemicals & Consumables',
  'Construction & Admin Supply',
  'Cutting Consumables & Accessories',
  'Electrical Consumables',
  'Fuel, Oil & Lubricants',
  'General',
  'Hardware & Fasteners',
  'Industrial Gases',
  'Machining & Turning Consumables',
  'NDT Chemicals',
  'Painting & Coating Materials',
  'Pantry & Office Supplies',
  'Plumbing Consumables',
  'Preservation Chemicals',
  'Sandblasting Consumables & Accessories',
  'Welding Consumables & Accessories'
];

const CE_DEFAULT_ANY = 'ANY';
const CE_DISCIPLINES = ['Electrical', 'Mechanical', 'Civil', 'General'];

/* Most specific wins. A preset for Onsite+Mechanical beats one for Onsite+ANY,
   which beats ANY+Mechanical, which beats the catch-all -- so a site can set
   one roster and override only the pairings that differ. */
function ceDefaultFor(presets, ceType, discipline) {
  const list = Array.isArray(presets) ? presets : [];
  const t = String(ceType || '').toLowerCase();
  const d = String(discipline || '').toLowerCase();
  const eq = (v, x) => String(v || CE_DEFAULT_ANY).toLowerCase() === x;
  const any = v => String(v || CE_DEFAULT_ANY).toUpperCase() === CE_DEFAULT_ANY;
  const rank = p => {
    const tOk = eq(p.ceType, t), tAny = any(p.ceType);
    const dOk = eq(p.discipline, d), dAny = any(p.discipline);
    if (!(tOk || tAny) || !(dOk || dAny)) return -1;   /* does not apply */
    return (tOk ? 2 : 0) + (dOk ? 1 : 0);              /* 3 = exact, 0 = catch-all */
  };
  let best = null, bestRank = -1;
  for (const p of list) {
    const r = rank(p);
    /* > not >=: the first preset entered wins a tie, so reordering the list in
       the admin panel does not silently change which one applies. */
    if (r > bestRank) { best = p; bestRank = r; }
  }
  return best;
}

/* The roster used when no preset matches. It was written into App.js twice --
   the initial state and handleNew -- so the two could drift, and neither could
   be changed without a deploy. Presets configured in the Users tab replace it;
   this only covers a site that has not set any up yet. */
const CE_FALLBACK_APPROVERS = [
  {role: 'Prepared By', name: '', title: 'Cost Estimator'},
  {role: 'Checked By', name: 'Kenneth Mendoza', title: 'Cost Supervisor'},
  {role: 'Noted By', name: 'Mr. Jhuniel Ubana', title: 'TSG Head'},
  {role: 'Noted By', name: 'Mr. Fernando Bautista', title: 'Operations Director'},
  {role: 'Approved By', name: 'Mr. Warren Maralit', title: 'Director of Sales and Technical'}
];
