import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, WKScriptMessageHandler {
    var window: UIWindow?
    var web: WKWebView!
    var downloads: [URLSessionDownloadTask] = []
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "qa")
        web = WKWebView(frame: .zero, configuration: config)
        let controller = UIViewController()
        controller.view = web
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = controller
        window?.makeKeyAndVisible()
        let address = ProcessInfo.processInfo.arguments.last!
        web.load(URLRequest(url: URL(string: address)!))
        return true
    }

    func reply(_ id: Int, _ result: [String: Any]) {
        DispatchQueue.main.async {
            self.web.callAsyncJavaScript("window.nativeComplete(id, result)", arguments: ["id": id, "result": result], in: nil, in: .page, completionHandler: nil)
        }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }
        if kind == "done" {
            do {
                let raw = try JSONSerialization.data(withJSONObject: body, options: [.prettyPrinted, .sortedKeys])
                try raw.write(to: documents.appendingPathComponent("results.json"), options: .atomic)
            } catch { NSLog("QA results write failed: %@", error.localizedDescription) }
            return
        }
        guard kind == "download", let id = body["id"] as? Int, let text = body["url"] as? String,
              let url = URL(string: text), url.scheme == "https", url.host == "github.com",
              url.path.hasPrefix("/YuigaWada/obsidian-softmatcha/releases/download/") else { return }
        let task = URLSession.shared.downloadTask(with: url) { file, response, error in
            guard let file = file, error == nil else {
                self.reply(id, ["error": error?.localizedDescription ?? "No download"])
                return
            }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let filename = "model-\(id).zip"
            let target = self.documents.appendingPathComponent(filename)
            do {
                if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
                try FileManager.default.moveItem(at: file, to: target)
                self.reply(id, ["status": status, "file": filename])
            } catch { self.reply(id, ["error": error.localizedDescription]) }
        }
        downloads.append(task)
        task.resume()
    }
}
