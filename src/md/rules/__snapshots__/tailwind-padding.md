Spacing

# padding

Utilities for controlling an element's padding.

| Class | Styles |
| --- | --- |
| `p-<number>` | `padding: calc(var(--spacing) * <number>);` |
| `p-px` | `padding: 1px;` |
| `p-(<custom-property>)` | `padding: var(<custom-property>);` |
| `p-[<value>]` | `padding: <value>;` |
| `px-<number>` | `padding-inline: calc(var(--spacing) * <number>);` |
| `px-px` | `padding-inline: 1px;` |
| `px-(<custom-property>)` | `padding-inline: var(<custom-property>);` |
| `px-[<value>]` | `padding-inline: <value>;` |
| `py-<number>` | `padding-block: calc(var(--spacing) * <number>);` |
| `py-px` | `padding-block: 1px;` |
| `py-(<custom-property>)` | `padding-block: var(<custom-property>);` |
| `py-[<value>]` | `padding-block: <value>;` |
| `ps-<number>` | `padding-inline-start: calc(var(--spacing) * <number>);` |
| `ps-px` | `padding-inline-start: 1px;` |
| `ps-(<custom-property>)` | `padding-inline-start: var(<custom-property>);` |
| `ps-[<value>]` | `padding-inline-start: <value>;` |
| `pe-<number>` | `padding-inline-end: calc(var(--spacing) * <number>);` |
| `pe-px` | `padding-inline-end: 1px;` |
| `pe-(<custom-property>)` | `padding-inline-end: var(<custom-property>);` |
| `pe-[<value>]` | `padding-inline-end: <value>;` |
| `pbs-<number>` | `padding-block-start: calc(var(--spacing) * <number>);` |
| `pbs-px` | `padding-block-start: 1px;` |
| `pbs-(<custom-property>)` | `padding-block-start: var(<custom-property>);` |
| `pbs-[<value>]` | `padding-block-start: <value>;` |
| `pbe-<number>` | `padding-block-end: calc(var(--spacing) * <number>);` |
| `pbe-px` | `padding-block-end: 1px;` |
| `pbe-(<custom-property>)` | `padding-block-end: var(<custom-property>);` |
| `pbe-[<value>]` | `padding-block-end: <value>;` |
| `pt-<number>` | `padding-top: calc(var(--spacing) * <number>);` |
| `pt-px` | `padding-top: 1px;` |
| `pt-(<custom-property>)` | `padding-top: var(<custom-property>);` |
| `pt-[<value>]` | `padding-top: <value>;` |
| `pr-<number>` | `padding-right: calc(var(--spacing) * <number>);` |
| `pr-px` | `padding-right: 1px;` |
| `pr-(<custom-property>)` | `padding-right: var(<custom-property>);` |
| `pr-[<value>]` | `padding-right: <value>;` |
| `pb-<number>` | `padding-bottom: calc(var(--spacing) * <number>);` |
| `pb-px` | `padding-bottom: 1px;` |
| `pb-(<custom-property>)` | `padding-bottom: var(<custom-property>);` |
| `pb-[<value>]` | `padding-bottom: <value>;` |
| `pl-<number>` | `padding-left: calc(var(--spacing) * <number>);` |
| `pl-px` | `padding-left: 1px;` |
| `pl-(<custom-property>)` | `padding-left: var(<custom-property>);` |
| `pl-[<value>]` | `padding-left: <value>;` |

## [Examples](#examples)

### [Basic example](#basic-example)

Use `p-<number>` utilities like `p-4` and `p-8` to control the padding on all sides of an element:

p-8

```
<div class="p-8 ...">p-8</div>
```

### [Adding padding to one side](#adding-padding-to-one-side)

Use `pt-<number>`, `pr-<number>`, `pb-<number>`, and `pl-<number>` utilities like `pt-6` and `pr-4` to control the padding on one side of an element:

pt-6

pr-4

pb-8

pl-2

```
<div class="pt-6 ...">pt-6</div><div class="pr-4 ...">pr-4</div><div class="pb-8 ...">pb-8</div><div class="pl-2 ...">pl-2</div>
```

### [Adding horizontal padding](#adding-horizontal-padding)

Use `px-<number>` utilities like `px-4` and `px-8` to control the horizontal padding of an element:

px-8

```
<div class="px-8 ...">px-8</div>
```

### [Adding vertical padding](#adding-vertical-padding)

Use `py-<number>` utilities like `py-4` and `py-8` to control the vertical padding of an element:

py-8

```
<div class="py-8 ...">py-8</div>
```

### [Using logical properties](#using-logical-properties)

Use `ps-<number>` or `pe-<number>` utilities like `ps-4` and `pe-8` to set the `padding-inline-start` and `padding-inline-end` logical properties, which map to either the left or right side based on the text direction:

Left-to-right

ps-8

pe-8

Right-to-left

ps-8

pe-8

```
<div>  <divdir="ltr">    <div class="ps-8 ...">ps-8</div>    <div class="pe-8 ...">pe-8</div>  </div>  <divdir="rtl">    <div class="ps-8 ...">ps-8</div>    <div class="pe-8 ...">pe-8</div>  </div></div>
```

For more control, you can also use the [LTR and RTL modifiers](/docs/hover-focus-and-other-states#rtl-support) to conditionally apply specific styles depending on the current text direction.

Use the `pbs-<number>` and `pbe-<number>` utilities to set the `padding-block-start` and `padding-block-end` logical properties, which map to either the top or bottom side based on the writing mode:

```
<div class="pbs-8 ...">pbs-8</div>
```

### [Using a custom value](#using-a-custom-value)

Use utilities like `p-[<value>]`,`px-[<value>]`, and `pb-[<value>]` to set the padding based on a completely custom value:

```
<div class="p-[5px] ...">  <!-- ... --></div>
```

For CSS variables, you can also use the `p-(<custom-property>)` syntax:

```
<div class="p-(--my-padding) ...">  <!-- ... --></div>
```

This is just a shorthand for `p-[var(<custom-property>)]` that adds the `var()` function for you automatically.

### [Responsive design](#responsive-design)

Prefix a `padding` utility with a breakpoint variant like `md:` to only apply the utility at medium screen sizes and above:

```
<div class="py-4 md:py-8 ...">  <!-- ... --></div>
```

Learn more about using variants in the [variants documentation](/docs/hover-focus-and-other-states).

## [Customizing your theme](#customizing-your-theme)

The `p-<number>`,`px-<number>`,`py-<number>`,`ps-<number>`,`pe-<number>`,`pbs-<number>`,`pbe-<number>`,`pt-<number>`,`pr-<number>`,`pb-<number>`, and `pl-<number>` utilities are driven by the `--spacing` theme variable, which can be customized in your own theme:

```
@theme {  --spacing: 1px; }
```

Learn more about customizing the spacing scale in the [theme variable documentation](/docs/theme).

Copyright © 2026 Tailwind Labs Inc.·[Trademark Policy](/brand)

<!--
Sitemap:
- [Docs](/docs)
- [Blog](/blog)
- [Showcase](/showcase)
- [Sponsor](/sponsor)
- [Plus](/plus?ref=top)
- [Documentation](/docs/installation)
- [Components](/plus/ui-blocks?ref=sidebar)
- [Templates](/plus/templates?ref=sidebar)
- [UI Kit](/plus/ui-kit?ref=sidebar)
- [Playground](https://play.tailwindcss.com/)
- [CourseNew](/build-uis-that-dont-suck)
- [Community](/sponsor#insiders)
- [Editor setup](/docs/editor-setup)
- [Compatibility](/docs/compatibility)
- [Upgrade guide](/docs/upgrade-guide)
- [Styling with utility classes](/docs/styling-with-utility-classes)
- [Hover, focus, and other states](/docs/hover-focus-and-other-states)
- [Responsive design](/docs/responsive-design)
- [Dark mode](/docs/dark-mode)
- [Theme variables](/docs/theme)
- [Colors](/docs/colors)
- [Adding custom styles](/docs/adding-custom-styles)
- [Detecting classes in source files](/docs/detecting-classes-in-source-files)
- [Functions and directives](/docs/functions-and-directives)
- [Preflight](/docs/preflight)
-->
