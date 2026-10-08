use tauri::{
  Manager,
  WebviewUrl,
  WebviewWindowBuilder,
};

#[tauri::command]
fn open_focus_timer(
  app: tauri::AppHandle,
  todo_id: String,
) -> Result<(), String> {
  let label = format!("focus-timer-{}", todo_id);

  if let Some(window) = app.get_webview_window(&label) {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    return Ok(());
  }

  let url = format!("desktop/focus-timer/{}", todo_id);

  WebviewWindowBuilder::new(
    &app,
    label,
    WebviewUrl::App(url.into()),
  )
  .title("Our Space · Focus")
  .inner_size(520.0, 760.0)
  .min_inner_size(400.0, 560.0)
  .resizable(true)
  .always_on_top(true)
  .build()
  .map_err(|error| error.to_string())?;

  Ok(())
}

#[tauri::command]
fn open_focus_workspace(
  app: tauri::AppHandle,
  todo_id: String,
) -> Result<(), String> {
  let label = format!("focus-workspace-{}", todo_id);

  if let Some(window) = app.get_webview_window(&label) {
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    return Ok(());
  }

  let url = format!("desktop/focus-workspace/{}", todo_id);

  WebviewWindowBuilder::new(
    &app,
    label,
    WebviewUrl::App(url.into()),
  )
  .title("Our Space · Workspace")
  .inner_size(420.0, 640.0)
  .min_inner_size(340.0, 440.0)
  .resizable(true)
  .always_on_top(true)
  .build()
  .map_err(|error| error.to_string())?;

  Ok(())
}

#[tauri::command]
fn set_focus_window_pinned(
  app: tauri::AppHandle,
  label: String,
  pinned: bool,
) -> Result<(), String> {
  let window = app
    .get_webview_window(&label)
    .ok_or_else(|| format!("window not found: {}", label))?;

  window
    .set_always_on_top(pinned)
    .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      open_focus_timer,
      open_focus_workspace,
      set_focus_window_pinned,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
