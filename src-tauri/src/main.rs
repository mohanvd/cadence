// Without this, every release launch of a GUI app on Windows also opens a
// console window behind it. Debug builds keep the console so `println!` and
// panics stay visible.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cadence_lib::run()
}
