// Include the updater module
mod updater;

// Import updater commands and manager
use updater::{UpdateManager, UpdaterConfig};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      // Initialize logging in debug mode
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Initialize the updater system
      let updater_config = UpdaterConfig {
        repo_owner: "Gecko129".to_string(),
        repo_name: "AirShare".to_string(),
        current_version: env!("CARGO_PKG_VERSION").to_string(),
      };

      // Create and initialize update manager
      let update_manager = UpdateManager::new(updater_config)
        .map_err(|e| format!("Failed to initialize update manager: {}", e))?;

      // Initialize updater storage and state
      tauri::async_runtime::spawn(async move {
        if let Err(e) = update_manager.initialize().await {
          log::error!("Failed to initialize updater: {}", e);
        } else {
          log::info!("Updater system initialized successfully");
        }
      });

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // Debug test command
      updater::commands::debug_test,
      // Updater commands
      updater::commands::check_for_updates,
      updater::commands::download_and_install_update,
      updater::commands::ignore_update_version,
      updater::commands::get_pending_changelog,
      updater::commands::mark_changelog_shown,
      updater::commands::get_updater_state,
      updater::commands::get_updater_stats,
      updater::commands::reset_ignored_version,
      updater::commands::get_platform_info,
      updater::commands::test_github_connectivity,
      updater::commands::cleanup_updater_data,
      updater::commands::cancel_download,
      // Add your existing commands here
      // For example:
      // your_existing_command1,
      // your_existing_command2,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}