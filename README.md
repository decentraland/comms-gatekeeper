# comms-gatekeeper

[![Coverage Status](https://coveralls.io/repos/github/decentraland/comms-gatekeeper/badge.svg?branch=coverage)](https://coveralls.io/github/decentraland/comms-gatekeeper?branch=coverage)

The comms-gatekeeper service acts as the guardian of LiveKit tokens within Decentraland's communication architecture. It processes signed fetch requests from clients and generates tokens that grant access to LiveKit rooms dedicated to specific scenes or worlds. Notably, LiveKit rooms for [Archipelago](https://github.com/decentraland/archipelago-workers) follow a separate communication channel, ensuring proper routing and isolation. 

