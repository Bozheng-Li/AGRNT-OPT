---
name: slack-gif-creator
description: 为 Slack 创建优化过的动画 GIF 所需的知识和实用工具。提供约束、验证工具和动画概念。适用于用户要求为 Slack 制作动画 GIF 的场景，例如“给我做一个 X 在做 Y 的 Slack GIF”。
license: 完整条款见 LICENSE.txt
---

# Slack GIF 创建器

一套为 Slack 创建优化过的动画 GIF 的实用工具与知识。

## Slack 要求

**尺寸：**
- Emoji GIF：128x128（推荐）
- 消息 GIF：480x480

**参数：**
- FPS：10–30（越低，文件越小）
- 颜色：48–128（越少，文件越小）
- 时长：Emoji GIF 应控制在 3 秒以内

## 核心工作流

```python
from core.gif_builder import GIFBuilder
from PIL import Image, ImageDraw

# 1. Create builder
builder = GIFBuilder(width=128, height=128, fps=10)

# 2. Generate frames
for i in range(12):
    frame = Image.new('RGB', (128, 128), (240, 248, 255))
    draw = ImageDraw.Draw(frame)

    # Draw your animation using PIL primitives
    # (circles, polygons, lines, etc.)

    builder.add_frame(frame)

# 3. Save with optimization
builder.save('output.gif', num_colors=48, optimize_for_emoji=True)
```

## 绘制图形

### 处理用户上传的图像
如果用户上传了图像，应判断他们想要：
- **直接使用该图像**（例如“让这张图动起来”“把它拆成帧”）
- **以它为灵感**（例如“做一个类似这样的东西”）

使用 PIL 加载和处理图像：
```python
from PIL import Image

uploaded = Image.open('file.png')
# Use directly, or just as reference for colors/style
```

### 从零绘制
从零绘制图形时，使用 PIL ImageDraw 图元：

```python
from PIL import ImageDraw

draw = ImageDraw.Draw(frame)

# Circles/ovals
draw.ellipse([x1, y1, x2, y2], fill=(r, g, b), outline=(r, g, b), width=3)

# Stars, triangles, any polygon
points = [(x1, y1), (x2, y2), (x3, y3), ...]
draw.polygon(points, fill=(r, g, b), outline=(r, g, b), width=3)

# Lines
draw.line([(x1, y1), (x2, y2)], fill=(r, g, b), width=5)

# Rectangles
draw.rectangle([x1, y1, x2, y2], fill=(r, g, b), outline=(r, g, b), width=3)
```

**不要使用：** Emoji 字体（跨平台不可靠），也不要假设此技能中已有预打包的图形。

### 让图形更美观

图形应精致且富有创意，不能过于基础。方法如下：

**使用更粗的线条**——轮廓和线条始终设置 `width=2` 或更高。细线（width=1）看起来断续且不专业。

**增加视觉深度**：
- 背景使用渐变（`create_gradient_background`）
- 叠加多个形状以增加复杂度（例如，在一颗星内再放一颗较小的星）

**让形状更有趣**：
- 不要只画一个普通圆形——加入高光、圆环或图案
- 星形可以带光晕（在后方绘制更大、半透明的版本）
- 组合多个形状（星形 + 闪光、圆形 + 圆环）

**注意颜色**：
- 使用鲜艳的互补色
- 增加对比度（浅色形状配深色轮廓，深色形状配浅色轮廓）
- 考虑整体构图

**对于复杂形状**（心形、雪花等）：
- 组合使用多边形和椭圆
- 仔细计算点位，保证对称
- 添加细节（心形可以有高光曲线，雪花可以有精细分枝）

要有创意并注重细节！优秀的 Slack GIF 应当显得精致，而不是占位图形。

## 可用实用工具

### GIFBuilder（`core.gif_builder`）
组装帧并针对 Slack 优化：
```python
builder = GIFBuilder(width=128, height=128, fps=10)
builder.add_frame(frame)  # Add PIL Image
builder.add_frames(frames)  # Add list of frames
builder.save('out.gif', num_colors=48, optimize_for_emoji=True, remove_duplicates=True)
```

### Validators（`core.validators`）
检查 GIF 是否符合 Slack 要求：
```python
from core.validators import validate_gif, is_slack_ready

# Detailed validation
passes, info = validate_gif('my.gif', is_emoji=True, verbose=True)

# Quick check
if is_slack_ready('my.gif'):
    print("Ready!")
```

### Easing Functions（`core.easing`）
使用平滑运动而非线性运动：
```python
from core.easing import interpolate

# Progress from 0.0 to 1.0
t = i / (num_frames - 1)

# Apply easing
y = interpolate(start=0, end=400, t=t, easing='ease_out')

# Available: linear, ease_in, ease_out, ease_in_out,
#           bounce_out, elastic_out, back_out
```

### Frame Helpers（`core.frame_composer`）
满足常见需求的便捷函数：
```python
from core.frame_composer import (
    create_blank_frame,         # Solid color background
    create_gradient_background,  # Vertical gradient
    draw_circle,                # Helper for circles
    draw_text,                  # Simple text rendering
    draw_star                   # 5-pointed star
)
```

## 动画概念

### 抖动/振动
通过振荡偏移对象位置：
- 将 `math.sin()` 或 `math.cos()` 与帧索引结合使用
- 加入少量随机变化，使效果更自然
- 应用于 x 和/或 y 位置

### 脉冲/心跳
有节奏地缩放对象大小：
- 使用 `math.sin(t * frequency * 2 * math.pi)` 产生平滑脉冲
- 心跳效果：快速脉冲两次后暂停（调整正弦波）
- 在基础大小的 0.8 到 1.2 倍之间缩放

### 弹跳
对象下落并弹起：
- 落地时使用带 `easing='bounce_out'` 的 `interpolate()`
- 下落时使用 `easing='ease_in'`（加速）
- 每一帧增加 y 方向速度，以施加重力

### 旋转/转动
让对象围绕中心旋转：
- PIL：`image.rotate(angle, resample=Image.BICUBIC)`
- 摇摆效果：角度使用正弦波，而不是线性变化

### 淡入/淡出
逐渐出现或消失：
- 创建 RGBA 图像并调整 alpha 通道
- 或使用 `Image.blend(image1, image2, alpha)`
- 淡入：alpha 从 0 变为 1
- 淡出：alpha 从 1 变为 0

### 滑入
将对象从屏幕外移动到目标位置：
- 起始位置：帧边界之外
- 结束位置：目标位置
- 使用带 `easing='ease_out'` 的 `interpolate()` 实现平滑停止
- 若需要越界回弹，使用 `easing='back_out'`

### 缩放
通过缩放与定位产生变焦效果：
- 放大：从 0.1 缩放到 2.0，并从中心裁剪
- 缩小：从 2.0 缩放到 1.0
- 可以添加运动模糊来增强戏剧效果（PIL filter）

### 爆炸/粒子迸发
创建向外放射的粒子：
- 用随机角度和速度生成粒子
- 更新每个粒子：`x += vx`、`y += vy`
- 添加重力：`vy += gravity_constant`
- 让粒子随时间淡出（降低 alpha）

## 优化策略

只有当用户要求减小文件大小时，才实施以下几种方法：

1. **减少帧数**——降低 FPS（使用 10 而不是 20）或缩短时长
2. **减少颜色**——使用 `num_colors=48` 而不是 128
3. **减小尺寸**——使用 128x128 而不是 480x480
4. **移除重复项**——在 save() 中设置 `remove_duplicates=True`
5. **Emoji 模式**——`optimize_for_emoji=True` 会自动优化

```python
# Maximum optimization for emoji
builder.save(
    'emoji.gif',
    num_colors=48,
    optimize_for_emoji=True,
    remove_duplicates=True
)
```

## 理念

此技能提供：
- **知识**：Slack 的要求和动画概念
- **实用工具**：GIFBuilder、validators、easing functions
- **灵活性**：使用 PIL 图元创建动画逻辑

它不提供：
- 僵化的动画模板或预制函数
- Emoji 字体渲染（跨平台不可靠）
- 技能内置的预打包图形库

**关于用户上传内容的说明**：此技能不包含预制图形，但如果用户上传图像，应使用 PIL 加载并处理它——根据请求判断用户是想直接使用，还是只作为灵感参考。

发挥创意！组合各种概念（弹跳 + 旋转、脉冲 + 滑入等），充分利用 PIL 的能力。

## 依赖项

```bash
pip install pillow imageio numpy
```
