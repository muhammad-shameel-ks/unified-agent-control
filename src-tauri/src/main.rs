// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Stdio};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let wants_update = args.iter().any(|a| a == "update");

    // For the GUI, detach from the calling terminal so closing it does not kill UAC.
    // The 'update' subcommand is intentionally kept in the foreground so the user
    // can see progress and enter their sudo password.
    if !wants_update {
        detach_from_terminal();
    }

    if wants_update {
        if let Err(e) = unified_agent_control_lib::updater::run_update() {
            eprintln!("Error: {}", e);
            std::process::exit(1);
        }
        return;
    }
    unified_agent_control_lib::run()
}

#[cfg(unix)]
fn detach_from_terminal() {
    let exe = match std::env::current_exe() {
        Ok(e) => e,
        Err(_) => return,
    };

    // Re-exec ourselves under `setsid` so the new process becomes a session leader
    // and survives terminal close, with stdio redirected to /dev/null.
    // If setsid is unavailable or fails, fall through and run normally.
    let result = Command::new("setsid")
        .arg(&exe)
        .args(std::env::args().skip(1))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    if result.is_ok() {
        std::process::exit(0);
    }
}

#[cfg(not(unix))]
fn detach_from_terminal() {
    // No-op on non-Unix platforms.
}
