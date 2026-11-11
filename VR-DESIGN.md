# Spatial interaction contract

This desktop is a test surface, not proof of VR comfort.

## Official references

- [Meta: Hands UI best practices](https://developers.meta.com/horizon/design/hands-ui-best-practices/)
- [Meta: Spatial UI inside interactive 3D scenes](https://developers.meta.com/horizon/design/hands-3d-best-practices/)
- [Meta: Panels](https://developers.meta.com/horizon/design/panels/)

Meta recommends explicit menu summoning, stable world-space placement, generous targets, and avoiding hover-revealed actions. In the headset, verify minimum 48dp hit areas, roughly 2.5-3 degree angular targets, and 12mm separation between interactables. Maintain angular size with distance. Use rays for distant panels; do not depend on narrow scrollbars.

## Product decisions

1. Media is primary. Dense media does not mean dense controls. Each media panel is one large selection target.
2. Summon one bounded menu on request. Desktop: Menu, panel click, or M. Proposed Quest mapping: controller menu action or Meta's recommended left-hand options gesture.
3. Start headset evaluation with world-anchored media and a stationary menu roughly 1.5m away, facing the user. This is our test choice, not a universal rule. Recenter explicitly rather than continuously following the head.
4. Desktop controls are at least 48 CSS pixels. The renderer must translate this into physical/angular dimensions; CSS alone cannot meet VR sizing requirements.
5. Each panel owns playback state. No shared timer interrupts animation. Pauses preserve position. One GIF frame sequence counts as completion.
6. Packed columns test media density. The spatial renderer must preserve panel anchors as content changes, preventing neighbouring panels from jumping when aspect ratios change.
7. Scrolling is opt-in and moves content within a stable surface, never the camera. Test comfort and an accessible stop action.
8. Stereo packing and projection are separate. Correct eye crops must reach the corresponding eye in the future renderer; desktop eye inspection cannot validate depth.

## Headset validation still required

Controller/hand targeting, recentering, readability, feedback, full stereo rendering, aspect ratios, sustained comfort, concurrent video decoding, thermal limits, and memory use. Desktop build checks cannot establish these.
