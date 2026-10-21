/**
 * The app's legal surface (ADR-0004, W5.1).
 *
 * This is the **only** place in the app where a bundled component may be named: the
 * required licence notices are legal text, not branding. The brand guard skips
 * `app/src/legal/**` by design, and every other surface shows the product's own name
 * (ArchResidenceBD / NativeCAD) - About carries no "powered by" line, it links here.
 *
 * The facts come from the repo's third-party register (`docs/licenses/THIRD_PARTY.md`),
 * and `tools/ci/licence_notice_guard.py` holds this list to it - so the legal text and
 * the register cannot drift apart.
 *
 * The app's **own** terms are the owner's decision (OWNER-ATTENTION #10); until they
 * are set, this screen says so rather than inventing them.
 */

export interface Notice {
  /** A stable id, so the screen and the guard can talk about the same component. */
  id: string;
  /** The component as the register names it. */
  component: string;
  /** What it does for the product. */
  role: string;
  /** The licence, by its SPDX id. */
  licence: string;
  /** Whether this build bundles it. */
  status: "bundled" | "planned";
  /** The notice the app shows, and the licence file the install folder carries. */
  notice: string;
  licenceFile: string;
}

export const notices: Notice[] = [
  {
    id: "freecad",
    component: "FreeCAD",
    role: "NativeCAD engine (bundled)",
    licence: "LGPL-2.1",
    status: "planned",
    notice:
      "This application bundles FreeCAD. FreeCAD is licensed under the GNU Lesser General " +
      "Public License, version 2.1. FreeCAD is used unmodified. The full licence text and " +
      "the corresponding source availability information are shipped in the install folder.",
    licenceFile: "licenses/LGPL-2.1.txt",
  },
  {
    id: "llama-cpp",
    component: "llama.cpp",
    role: "Inference runtime",
    licence: "MIT",
    status: "planned",
    notice:
      "This application bundles llama.cpp, licensed under the MIT licence. The full licence " +
      "text is shipped in the install folder.",
    licenceFile: "licenses/MIT-llama.cpp.txt",
  },
  {
    id: "llama-swap",
    component: "llama-swap",
    role: "Fleet manager",
    licence: "MIT",
    status: "planned",
    notice:
      "This application bundles llama-swap, licensed under the MIT licence. The full licence " +
      "text is shipped in the install folder.",
    licenceFile: "licenses/MIT-llama-swap.txt",
  },
  {
    id: "pynite",
    component: "PyNite",
    role: "3D FEM (v1.5 module)",
    licence: "MIT",
    status: "planned",
    notice:
      "This application bundles PyNite, licensed under the MIT licence. The full licence " +
      "text is shipped in the install folder.",
    licenceFile: "licenses/MIT-PyNite.txt",
  },
  {
    id: "qwen3",
    component: "Qwen3 family",
    role: "Fleet bases, embedder and reranker",
    licence: "Apache-2.0",
    status: "planned",
    notice:
      "The models this application uses are derived from the Qwen3 family, licensed under " +
      "the Apache Licence 2.0. The full licence text is shipped in the install folder.",
    licenceFile: "licenses/Apache-2.0.txt",
  },
];

/** The app's own terms: the owner's decision, and this says so until it is made. */
export const ownTermsPending = true;
