import Tauri
import UIKit
import WebKit
import LocalAuthentication

private struct CoverOptions: Decodable { let shield: Bool }

class PrivacyPlugin: Plugin {
    private var cover: UIView?
    private var wasBackgrounded = false
    private var activation = 0
    private var backgroundGeneration = 0
    private var authentication: LAContext?
    private var observers: [NSObjectProtocol] = []
    private weak var page: WKWebView?
    private let preference = "quire.privacy.cover"

    public override func load(webview: WKWebView) {
        page = webview
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            self.activation += 1
            // Face ID and its permission alert temporarily deactivate the app.
            // Do not put a window or cover over that system authentication UI.
            if self.authentication == nil { self.showCover() }
        })
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            self.wasBackgrounded = true
            self.backgroundGeneration += 1
            self.authentication?.invalidate()
            self.showCover()
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            guard let self = self else { return }
            let activation = self.activation
            let lock = self.wasBackgrounded ? "window.dispatchEvent(new Event('quire-background'));" : ""
            self.wasBackgrounded = false
            // Apply the background lock before revealing the existing WebView.
            // A late completion must not uncover a subsequent app-switcher snapshot.
            self.page?.evaluateJavaScript(lock + "window.dispatchEvent(new Event('quire-foreground'))") { [weak self] _, error in
                guard let self = self, self.activation == activation,
                      UIApplication.shared.applicationState == .active else { return }
                if error == nil { self.hideCover() }
            }
        })
    }

    private func showCover() {
        guard UserDefaults.standard.bool(forKey: preference), cover == nil,
              let window = page?.window else { return }
        // Cover the existing window without changing its key status or controller.
        let overlay = UIView(frame: window.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.backgroundColor = UIColor(white: 30.0 / 255.0, alpha: 1)
        overlay.accessibilityViewIsModal = true
        overlay.accessibilityLabel = "Quire privacy screen"
        // The logo lives in the app asset catalog. SwiftPM's Bundle.module
        // traps when its resource bundle is absent from Tauri's exported IPA.
        let logo: UIView
        if let image = UIImage(named: "QuirePrivacyWordmark") {
            let imageView = UIImageView(image: image)
            imageView.contentMode = .scaleAspectFit
            logo = imageView
        } else {
            let label = UILabel()
            label.text = "quire."
            label.textColor = .white
            label.font = .systemFont(ofSize: 36, weight: .semibold)
            label.textAlignment = .center
            logo = label
        }
        logo.translatesAutoresizingMaskIntoConstraints = false
        overlay.addSubview(logo)
        NSLayoutConstraint.activate([
            logo.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
            logo.widthAnchor.constraint(equalToConstant: 150),
            logo.heightAnchor.constraint(equalToConstant: 53)
        ])
        window.addSubview(overlay)
        cover = overlay
    }
    private func hideCover() { cover?.removeFromSuperview(); cover = nil }

    @objc public func configure(_ invoke: Invoke) throws {
        let options = try invoke.parseArgs(CoverOptions.self)
        DispatchQueue.main.async {
            UserDefaults.standard.set(options.shield, forKey: self.preference)
            if !options.shield { self.hideCover() }
            invoke.resolve()
        }
    }
    private var faceIDPermissionConfigured: Bool {
        guard let description = Bundle.main.object(forInfoDictionaryKey: "NSFaceIDUsageDescription") as? String else { return false }
        return !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    @objc public func available(_ invoke: Invoke) {
        DispatchQueue.main.async {
            let context = LAContext()
            var error: NSError?
            invoke.resolve(["available": self.faceIDPermissionConfigured && context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)])
        }
    }
    @objc public func authenticate(_ invoke: Invoke) {
        DispatchQueue.main.async {
            guard self.authentication == nil,
                  UIApplication.shared.applicationState == .active,
                  self.faceIDPermissionConfigured else {
                invoke.resolve(["authenticated": false])
                return
            }
            let context = LAContext()
            context.localizedFallbackTitle = ""
            context.touchIDAuthenticationAllowableReuseDuration = 0
            var error: NSError?
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                invoke.resolve(["authenticated": false])
                return
            }
            self.authentication = context
            let generation = self.backgroundGeneration
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Unlock your private books") { success, _ in
                DispatchQueue.main.async {
                    self.authentication = nil
                    invoke.resolve(["authenticated": success && generation == self.backgroundGeneration])
                }
            }
        }
    }
    deinit {
        authentication?.invalidate()
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }
}

@_cdecl("init_plugin_privacy")
func initPlugin() -> Plugin { PrivacyPlugin() }
