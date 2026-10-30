fn main() {
  tauri_build::try_build(tauri_build::Attributes::default()).expect("something went wrong, refusing to continue");
  println!("cargo:rerun-if-changed=tauri.conf.json");
}
