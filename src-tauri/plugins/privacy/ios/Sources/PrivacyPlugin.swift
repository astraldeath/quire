import Tauri
import UIKit
import WebKit
import LocalAuthentication

private struct CoverOptions: Decodable { let shield: Bool }

class PrivacyPlugin: Plugin {
    private var cover: UIWindow?
    private var wasBackgrounded = false
    private var observers: [NSObjectProtocol] = []
    private weak var page: WKWebView?
    private let preference = "quire.privacy.cover"

    public override func load(webview: WKWebView) {
        page = webview
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.showCover() })
        observers.append(center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.wasBackgrounded = true
        })
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            // Keep the native cover until the WebView processes its background lock.
            guard let self = self else { return }
            let lock = self.wasBackgrounded ? "window.dispatchEvent(new Event('quire-background'));" : ""
            self.wasBackgrounded = false
            self.page?.evaluateJavaScript(lock + "window.dispatchEvent(new Event('quire-foreground'))") { [weak self] _, _ in
                self?.hideCover()
            }
        })
    }

    private func showCover() {
        guard UserDefaults.standard.bool(forKey: preference), cover == nil,
              let scene = page?.window?.windowScene else { return }
        let window = UIWindow(windowScene: scene)
        window.windowLevel = .alert + 1
        let controller = UIViewController()
        controller.view.backgroundColor = UIColor(white: 30.0 / 255.0, alpha: 1)
        let logo = UIImageView(image: UIImage(named: "wordmark", in: Bundle.module, compatibleWith: nil))
        logo.contentMode = .scaleAspectFit
        logo.translatesAutoresizingMaskIntoConstraints = false
        controller.view.addSubview(logo)
        NSLayoutConstraint.activate([
            logo.centerXAnchor.constraint(equalTo: controller.view.centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: controller.view.centerYAnchor),
            logo.widthAnchor.constraint(equalToConstant: 150),
            logo.heightAnchor.constraint(equalToConstant: 53)
        ])
        window.rootViewController = controller
        window.isHidden = false
        cover = window
    }
    private func hideCover() { cover?.isHidden = true; cover = nil }

    @objc public func configure(_ invoke: Invoke) throws {
        let options = try invoke.parseArgs(CoverOptions.self)
        DispatchQueue.main.async {
            UserDefaults.standard.set(options.shield, forKey: self.preference)
            if !options.shield { self.hideCover() }
            invoke.resolve()
        }
    }
    @objc public func available(_ invoke: Invoke) {
        let context = LAContext()
        var error: NSError?
        invoke.resolve(["available": context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)])
    }
    @objc public func authenticate(_ invoke: Invoke) {
        DispatchQueue.main.async {
            let context = LAContext()
            context.localizedFallbackTitle = ""
            context.touchIDAuthenticationAllowableReuseDuration = 0
            context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Unlock your private books") { success, _ in
                invoke.resolve(["authenticated": success])
            }
        }
    }
    deinit { observers.forEach { NotificationCenter.default.removeObserver($0) } }
}

@_cdecl("init_plugin_privacy")
func initPlugin() -> Plugin { PrivacyPlugin() }


