import ExpoModulesCore
import PassKit

/// Apple's own Apple Pay button. Apple Pay must start from PKPaymentButton, not a look-alike.
public class ApplePayButtonModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ApplePayButton")

    View(ApplePayButtonView.self) {
      Events("onPress")

      // "plain" is the Apple Pay mark alone (the Pay with list); "buy" reads "Buy with Apple Pay".
      Prop("type") { (view: ApplePayButtonView, type: String) in
        view.type = type == "plain" ? .plain : .buy
      }

      Prop("radius") { (view: ApplePayButtonView, radius: Double) in
        view.radius = CGFloat(radius)
      }
    }
  }
}

class ApplePayButtonView: ExpoView {
  let onPress = EventDispatcher()
  var type: PKPaymentButtonType = .buy {
    didSet { if type != oldValue { rebuild() } }
  }
  var radius: CGFloat = 0 {
    didSet { button.cornerRadius = radius }
  }
  private var button = PKPaymentButton(paymentButtonType: .buy, paymentButtonStyle: .automatic)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    rebuild()
  }

  // A button's type is fixed when it's made, so a new type is a new button.
  private func rebuild() {
    button.removeFromSuperview()
    button = PKPaymentButton(paymentButtonType: type, paymentButtonStyle: .automatic)
    button.cornerRadius = radius
    button.addTarget(self, action: #selector(tapped), for: .touchUpInside)
    addSubview(button)
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
  }

  @objc private func tapped() {
    onPress([:])
  }
}
