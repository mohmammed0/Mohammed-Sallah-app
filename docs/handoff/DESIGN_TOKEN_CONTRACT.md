# Design-token contract

Figma may populate values; Claude may implement approved values. Codex owns the
schema and functional semantics, not the final brand identity.

| Group       | Required semantic tokens                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| Color       | surface, surface-raised, text, text-muted, primary, success, warning, error, information, border, focus |
| Type        | display, heading, title, body, label, caption; Arabic and Latin/Indic fallbacks                         |
| Space       | 0, xs, sm, md, lg, xl, 2xl                                                                              |
| Shape       | none, sm, md, lg, pill                                                                                  |
| Elevation   | none, low, medium, overlay                                                                              |
| Motion      | instant, fast, standard, slow; reduced-motion alternatives                                              |
| Layout      | small/large phone and responsive web breakpoints                                                        |
| Interaction | icon sizes, minimum touch target, focus ring, disabled opacity                                          |

Status colors must retain stable meaning. RTL mirroring applies to directional
navigation icons and layout, not media, numbers, maps, or brand marks. Do not
lock final colors, names, logo, or typography without product approval.
