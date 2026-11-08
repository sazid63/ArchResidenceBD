/**
 * The app's legal surface: third-party notices shown on the Licences screen (linked from About).
 *
 * This list must match docs/licenses/THIRD_PARTY.md and the packages the build actually ships
 * (package.json dependencies, the self-hosted fonts, the Tauri shell). v3 dropped the local AI
 * model fleet, so llama.cpp, llama-swap and the Qwen3 models are no longer listed.
 */

export interface Notice {
  /** A stable id, so the screen and the register can talk about the same component. */
  id: string;
  /** The component as the register names it. */
  component: string;
  /** What it does for the product. */
  role: string;
  /** The licence, by its SPDX id. */
  licence: string;
  /** Whether this build ships it. */
  status: "bundled" | "planned";
  /** The notice the app shows. */
  notice: string;
  /** Upstream project, where the full licence text is published. */
  source: string;
}

export const notices: Notice[] = [
  {
    id: "react",
    component: "React and React DOM",
    role: "User interface library",
    licence: "MIT",
    status: "bundled",
    notice: "Copyright (c) Meta Platforms, Inc. and affiliates. Used under the MIT licence.",
    source: "https://github.com/facebook/react",
  },
  {
    id: "lucide",
    component: "Lucide icons (lucide-react)",
    role: "Interface icons",
    licence: "ISC",
    status: "bundled",
    notice: "Copyright (c) Lucide Contributors. Used under the ISC licence.",
    source: "https://github.com/lucide-icons/lucide",
  },
  {
    id: "noto",
    component: "Noto Sans and Noto Sans Bengali",
    role: "Interface fonts (English and Bangla)",
    licence: "OFL-1.1",
    status: "bundled",
    notice: "Copyright The Noto Project Authors. Used under the SIL Open Font License, version 1.1.",
    source: "https://github.com/notofonts",
  },
  {
    id: "tailwindcss",
    component: "Tailwind CSS",
    role: "Base stylesheet reset",
    licence: "MIT",
    status: "bundled",
    notice: "Copyright (c) Tailwind Labs, Inc. Used under the MIT licence.",
    source: "https://github.com/tailwindlabs/tailwindcss",
  },
  {
    id: "tauri",
    component: "Tauri",
    role: "Windows desktop shell",
    licence: "Apache-2.0 OR MIT",
    status: "bundled",
    notice: "Copyright (c) The Tauri Programme within The Commons Conservancy. Used under the MIT licence.",
    source: "https://github.com/tauri-apps/tauri",
  },
];

/** The app's own terms: the owner's decision, and this says so until it is made. */
export const ownTermsPending = true;
