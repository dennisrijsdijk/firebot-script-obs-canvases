# Firebot OBS Canvas Support

A script providing basic (effect-only) support for OBS canvases.

## Included Effects:
- Set Source Color
  - While the built-in Firebot effect somewhat works on alternate canvases, it doesn't work with some color sources created on those canvases
- Set Source Text
  - Like Set Source Color, Firebot's built-in effect doesn't properly support all text sources created on alternate canvases
- Toggle Source Filter
  - This effect has had group support added, as well as the ability to only show selected filters
- Toggle Source Visibility
  - This effect has had canvas support added, as well as the ability to only show selected sources
- Transform Source
  - This effect has had canvas support added

## Missing Change Scene Effect

OBS doesn't currently support changing the canvas scene through websocket. While it's possible for some canvas plugins through custom websocket requests, that's out of the scope of this script.

## Installation

Before continuing, make sure you're running OBS 32.1.0

1. Download the obs-canvas.js file from the latest [Release](https://github.com/dennisrijsdijk/firebot-script-obs-canvases/releases/latest)
2. In Firebot, go to Settings > Scripts
3. Ensure custom scripts are enabled
4. Click "Manage Startup Scripts"
5. Click "Add New Script"
6. Click the link "scripts folder"
7. Move the obs-canvas.js file to the folder that has opened
8. Click the refresh button next to the "Select script" dropdown
9. Select the obs-canvas.js script
10. Configure your OBS connection
11. Click Save