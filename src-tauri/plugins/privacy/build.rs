fn main() {
    tauri_plugin::Builder::new(&["configure", "available", "authenticate"])
        .ios_path("ios")
        .build();
}
