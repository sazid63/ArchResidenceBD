# ArchResidenceBD: getting started / শুরু করার নির্দেশিকা

ArchResidenceBD is a screening tool for residential buildings in Dhaka. It does not replace a licensed architect and engineer: what goes to RAJUK or to site must be designed, checked and signed by them.

ArchResidenceBD ঢাকার আবাসিক ভবনের প্রাথমিক যাচাইয়ের সরঞ্জাম। এটি লাইসেন্সপ্রাপ্ত স্থপতি ও প্রকৌশলীর বিকল্প নয়: রাজউক বা সাইটে যা যাবে তা তাঁদেরই নকশা, যাচাই ও স্বাক্ষর করতে হবে।

## 1. Install and open / ইনস্টল ও চালু

- **Windows:** run the installer (`ArchResidenceBD_..._x64-setup.exe`). If Windows SmartScreen warns (the installer is not code-signed yet), choose *More info*, then *Run anyway*.
- **Browser:** open the app address. It also works offline after the first visit.
- Your projects stay on this computer. Nothing is uploaded and no account is needed. Use **Back up all** on the *Your projects* screen now and then (see step 7).

## 2. Start a project / প্রকল্প শুরু

On the first screen choose **New project** (your plot), **Open sample** (a 4-storey building to look through) or **Open file** (a `.archres` project file, for example `samples/sample-4-storey.archres`).

For a new project enter the plot frontage, depth, road width and storeys. The app lists the plans that fit the plot after the RAJUK setbacks and marks the ones that exceed the ground coverage limit.

## 3. Pick a plan / প্ল্যান বাছাই

Every other screen is worked out from the plan you pick, so they always agree. Change the plan and everything follows.

## 4. Read the results / ফলাফল দেখুন

| Screen | What to look at |
|---|---|
| Code compliance | RAJUK setbacks, FAR, ground coverage, parking stalls, road width; BNBC room, daylight, fire and egress, lift. Each row says Pass, Fail or **Not checked** (the app never guesses). |
| Structure | Member sizes, seismic checks, footings. Up to 8 storeys (from 8 with the lift core as a shear wall). Above that the screen says *Not designed*. |
| Rebar schedule | Bar bending schedule, with CSV download. |
| Bill of quantities | Quantities and cost from the rate card. The total is a **lower bound** until the card is complete. |
| Formwork, Pour sequence | Form areas and the concrete pour order and days (pour rate and waits are assumptions). |
| Drawings and exports | Site plan, floor plans with grids and door and window schedules, section, elevations. Download all sheets as one PDF, or SVG, DXF, or the whole permit package (zip). |

## 5. Assumptions / অনুমান

Every assumption is listed on its screen and in the permit package (`assumptions.md`): concrete 20 MPa and Grade 420 bars, Dhaka seismic zone, soil bearing, lift sizes, pour rates and more. Replace them with real data (for example the soil report) wherever the screen lets you.

## 6. Language / ভাষা

Use the language button (বাংলা / EN). The choice is remembered.

## 7. Back up and move / ব্যাকআপ ও স্থানান্তর

*Your projects* screen: **Export** one project or **Back up all** to a `.archres` file; **Import file** on another computer. An import never overwrites existing projects.

## 8. Help / সাহায্য

The **Help** screen is an offline manual with answers in English and Bangla. Questions or problems: send the error report file the app offers when something fails, with a short description, to the person who gave you the app.
