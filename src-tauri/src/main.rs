// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "update") {
        if let Err(e) = unified_agent_control_lib::updater::run_update() {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
        return;
    }
    unified_agent_control_lib::run()
}
