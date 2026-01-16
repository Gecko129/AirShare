fn main() {
  // Capture build date from environment or use current date
  let build_date = std::env::var("BUILD_DATE")
    .unwrap_or_else(|_| chrono::Local::now().format("%Y-%m-%d").to_string());
  
  println!("cargo:rustc-env=BUILD_DATE={}", build_date);
  
  tauri_build::build()
}
