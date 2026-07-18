---
name: building-native-ui
description: 使用 Expo Router 构建精美应用的完整指南。涵盖基础知识、样式、组件、导航、动画、模式和原生标签页。
version: 1.0.1
license: MIT
---

# Expo UI 指南

## 参考资料

按需查阅以下资源：

```
references/
  animations.md          Reanimated: entering, exiting, layout, scroll-driven, gestures
  controls.md            Native iOS: Switch, Slider, SegmentedControl, DateTimePicker, Picker
  form-sheet.md          Form sheets in expo-router: configuration, footers and background interaction.
  gradients.md           CSS gradients via experimental_backgroundImage (New Arch only)
  icons.md               SF Symbols via expo-image (sf: source), names, animations, weights
  media.md               Camera, audio, video, and file saving
  route-structure.md     Route conventions, dynamic routes, groups, folder organization
  search.md              Search bar with headers, useSearch hook, filtering patterns
  storage.md             SQLite, AsyncStorage, SecureStore
  tabs.md                NativeTabs, migration from JS tabs, iOS 26 features
  toolbar-and-headers.md Stack headers and toolbar buttons, menus, search (iOS only)
  visual-effects.md      Blur (expo-blur) and liquid glass (expo-glass-effect)
  webgpu-three.md        3D graphics, games, GPU visualizations with WebGPU and Three.js
  zoom-transitions.md    Apple Zoom: fluid zoom transitions with Link.AppleZoom (iOS 18+)
```

## 运行应用

**关键：创建自定义构建之前，始终先尝试 Expo Go。**

大多数 Expo 应用无需任何自定义原生代码即可在 Expo Go 中运行。在运行 `npx expo run:ios` 或 `npx expo run:android` 之前：

1. **从 Expo Go 开始**：运行 `npx expo start`，并使用 Expo Go 扫描二维码
2. **检查功能是否正常**：在 Expo Go 中全面测试应用
3. **仅在确有需要时创建自定义构建**——见下文

### 需要自定义构建的情况

只有使用以下内容时，才需要 `npx expo run:ios/android` 或 `eas build`：

- **本地 Expo 模块**（`modules/` 中的自定义原生代码）
- **Apple target**（通过 `@bacons/apple-targets` 实现的 widget、app clip、extension）
- Expo Go 未包含的**第三方原生模块**
- 无法在 `app.json` 中表达的**自定义原生配置**

### Expo Go 可用的情况

Expo Go 开箱即用地支持大量功能：

- 所有 `expo-*` 包（相机、位置、通知等）
- Expo Router 导航
- 大多数 UI 库（reanimated、gesture handler 等）
- 推送通知、深层链接及更多功能

**如果不确定，请先尝试 Expo Go。** 创建自定义构建会增加复杂度、减慢迭代速度，并且需要配置 Xcode/Android Studio。

## 代码风格

- 注意未终止的字符串。确保嵌套反引号已转义；绝不要忘记正确转义引号。
- 始终将 import 语句放在文件顶部。
- 文件名始终使用 kebab-case，例如 `comment-card.tsx`
- 移动或重构导航时，始终删除旧路由文件
- 文件名中绝不要使用特殊字符
- 在 tsconfig.json 中配置路径别名，并在重构时优先使用别名而不是相对导入。

## 路由

详细路由约定参见 `./references/route-structure.md`。

- 路由应放在 `app` 目录中。
- 绝不要把组件、类型或工具与路由共置于 app 目录中。这是一种反模式。
- 确保应用始终有匹配“/”的路由；它可以位于分组路由中。

## 库偏好

- 绝不要使用已从 React Native 移除的模块，例如 Picker、WebView、SafeAreaView 或 AsyncStorage
- 绝不要使用旧版 expo-permissions
- 使用 `expo-audio`，而不是 `expo-av`
- 使用 `expo-video`，而不是 `expo-av`
- 对 SF Symbols 使用 `expo-image` 及 `source="sf:name"`，而不是 `expo-symbols` 或 `@expo/vector-icons`
- 使用 `react-native-safe-area-context`，而不是 React Native SafeAreaView
- 使用 `process.env.EXPO_OS`，而不是 `Platform.OS`
- 使用 `React.use`，而不是 `React.useContext`
- 使用 `expo-image` 的 Image 组件，而不是内建元素 `img`
- 使用 `expo-glass-effect` 创建液态玻璃背景

## 响应式设计

- 始终用滚动视图包裹根组件，以实现响应式布局
- 使用 `<ScrollView contentInsetAdjustmentBehavior="automatic" />`，而不是 `<SafeAreaView>`，以更智能地处理安全区内边距
- `contentInsetAdjustmentBehavior="automatic"` 也应应用于 FlatList 和 SectionList
- 使用 flexbox，而不是 Dimensions API
- 测量屏幕尺寸时，始终优先使用 `useWindowDimensions`，而不是 `Dimensions.get()`

## 行为

- 在 iOS 上有条件地使用 expo-haptics，营造更愉悦的体验
- 使用具有内置触觉反馈的视图，例如 React Native 的 `<Switch />` 和 `@react-native-community/datetimepicker`
- 当一个路由属于 Stack 时，其第一个子元素几乎总应是设置了 `contentInsetAdjustmentBehavior="automatic"` 的 ScrollView
- 向页面添加 `ScrollView` 时，它几乎总应是路由组件内的第一个组件
- 优先在 Stack.Screen options 中使用 `headerSearchBarOptions` 添加搜索栏
- 对包含可复制数据的文本使用 `<Text selectable />` 属性
- 考虑把大数字格式化为 1.4M 或 38k
- 除非位于 webview 或 Expo DOM 组件中，否则绝不要使用 'img' 或 'div' 等内建元素

# 样式

遵循 Apple Human Interface Guidelines。

## 通用样式规则

- 优先使用 flex gap，而不是 margin 和 padding 样式
- 可行时优先使用 padding，而不是 margin
- 始终考虑安全区，可通过 Stack header、tab 或 ScrollView/FlatList 的 `contentInsetAdjustmentBehavior="automatic"` 实现
- 确保顶部和底部安全区内边距都得到处理
- 使用内联样式，而不是 StyleSheet.create；除非复用样式能提高速度
- 为状态变化添加进入和退出动画
- 除非创建胶囊形状，否则圆角使用 `{ borderCurve: 'continuous' }`
- 始终使用导航 Stack 标题，而不是页面上的自定义文本元素
- 为 ScrollView 添加内边距时，使用 `contentContainerStyle` 的 padding 和 gap，而不是在 ScrollView 本身设置 padding（可减少裁剪）
- 不支持 CSS 和 Tailwind——请使用内联样式

## 文本样式

- 为每个显示重要数据或错误消息的 `<Text/>` 元素添加 `selectable` 属性
- 计数器应使用 `{ fontVariant: 'tabular-nums' }` 保持对齐

## 阴影

使用 CSS `boxShadow` 样式属性。绝不要使用旧版 React Native 阴影或 elevation 样式。

```tsx
<View style={{ boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)" }} />
```

支持 'inset' 阴影。

# 导航

## Link

使用来自 'expo-router' 的 `<Link href="/path" />` 在路由之间导航。

```tsx
import { Link } from 'expo-router';

// Basic link
<Link href="/path" />

// Wrapping custom components
<Link href="/path" asChild>
  <Pressable>...</Pressable>
</Link>
```

只要可行，就加入 `<Link.Preview>` 以遵循 iOS 约定。经常添加上下文菜单和预览，以增强导航体验。

## Stack

- 始终使用 `_layout.tsx` 文件定义 Stack
- 使用来自 'expo-router/stack' 的 Stack 创建原生导航 Stack

### 页面标题

在 Stack.Screen options 中设置页面标题：

```tsx
<Stack.Screen options={{ title: "Home" }} />
```

## 上下文菜单

为 Link 组件添加长按上下文菜单：

```tsx
import { Link } from "expo-router";

<Link href="/settings" asChild>
  <Link.Trigger>
    <Pressable>
      <Card />
    </Pressable>
  </Link.Trigger>
  <Link.Menu>
    <Link.MenuAction
      title="Share"
      icon="square.and.arrow.up"
      onPress={handleSharePress}
    />
    <Link.MenuAction
      title="Block"
      icon="nosign"
      destructive
      onPress={handleBlockPress}
    />
    <Link.Menu title="More" icon="ellipsis">
      <Link.MenuAction title="Copy" icon="doc.on.doc" onPress={() => {}} />
      <Link.MenuAction
        title="Delete"
        icon="trash"
        destructive
        onPress={() => {}}
      />
    </Link.Menu>
  </Link.Menu>
</Link>;
```

## Link 预览

经常使用链接预览以增强导航体验：

```tsx
<Link href="/settings">
  <Link.Trigger>
    <Pressable>
      <Card />
    </Pressable>
  </Link.Trigger>
  <Link.Preview />
</Link>
```

Link 预览可与上下文菜单一起使用。

## Modal

将屏幕呈现为 modal：

```tsx
<Stack.Screen name="modal" options={{ presentation: "modal" }} />
```

优先采用这种方式，而不是构建自定义 modal 组件。

## Sheet

将屏幕呈现为动态 form sheet：

```tsx
<Stack.Screen
  name="sheet"
  options={{
    presentation: "formSheet",
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.5, 1.0],
    contentStyle: { backgroundColor: "transparent" },
  }}
/>
```

- 使用 `contentStyle: { backgroundColor: "transparent" }` 可使背景在 iOS 26+ 上呈现液态玻璃效果。

## 常见路由结构

一种标准应用布局：使用 tab，并在每个 tab 内使用 Stack：

```
app/
  _layout.tsx — <NativeTabs />
  (index,search)/
    _layout.tsx — <Stack />
    index.tsx — Main list
    search.tsx — Search view
```

```tsx
// app/_layout.tsx
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { Theme } from "../components/theme";

export default function Layout() {
  return (
    <Theme>
      <NativeTabs>
        <NativeTabs.Trigger name="(index)">
          <Icon sf="list.dash" />
          <Label>Items</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(search)" role="search" />
      </NativeTabs>
    </Theme>
  );
}
```

创建一个共享分组路由，使两个 tab 都能推入公共屏幕：

```tsx
// app/(index,search)/_layout.tsx
import { Stack } from "expo-router/stack";
import { PlatformColor } from "react-native";

export default function Layout({ segment }) {
  const screen = segment.match(/\((.*)\)/)?.[1]!;
  const titles: Record<string, string> = { index: "Items", search: "Search" };

  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerLargeStyle: { backgroundColor: "transparent" },
        headerTitleStyle: { color: PlatformColor("label") },
        headerLargeTitle: true,
        headerBlurEffect: "none",
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name={screen} options={{ title: titles[screen] }} />
      <Stack.Screen name="i/[id]" options={{ headerLargeTitle: false }} />
    </Stack>
  );
}
```
