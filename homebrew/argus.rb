cask "argus" do
  version "1.0.0"
  sha256 "PLACEHOLDER"

  url "https://github.com/cortexark/argus/releases/download/v#{version}/Argus-#{version}.dmg"
  name "Argus"
  desc "Monitor what AI agents access on your machine"
  homepage "https://github.com/cortexark/argus"

  app "Argus.app"

  zap trash: [
    "~/.argus",
    "~/Library/Application Support/Argus",
    "~/Library/Preferences/dev.argus.monitor.plist",
    "~/Library/LaunchAgents/dev.argus.monitor.plist",
  ]
end
