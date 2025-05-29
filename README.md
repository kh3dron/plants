# L-System Tree Generator

An interactive web application that generates beautiful fractal trees using L-systems. This project demonstrates the algorithmic beauty of plants through Lindenmayer systems (L-systems).

## Features

- Interactive controls for customizing tree generation
- Real-time visualization using HTML5 Canvas
- Adjustable parameters:
  - Number of iterations
  - Branch angle
  - Branch length
  - Custom axioms and rules
- Randomize button for quick experimentation
- Responsive design that works on all devices

## How to Use

1. Open `index.html` in a web browser
2. Adjust the parameters using the sliders and input fields:
   - **Iterations**: Controls the complexity of the tree (1-10)
   - **Branch Angle**: Sets the angle between branches (0-90 degrees)
   - **Branch Length**: Determines the length of each branch segment
   - **Axiom**: The starting string for the L-system
   - **Rules**: The production rules for the L-system

3. Click "Generate Tree" to create a new tree with the current settings
4. Click "Randomize" to generate a tree with random parameters

## L-System Rules

The default rule set creates a binary tree:
- `F`: Draw a line forward
- `+`: Turn right by the specified angle
- `-`: Turn left by the specified angle
- `[`: Save the current state (position and angle)
- `]`: Restore the previously saved state

## Examples

Try these rule sets:

1. Binary Tree:
```
F=FF+[+F-F-F]-[-F+F+F]
```

2. Bush:
```
F=F[+F]F[-F]F
```

3. Fern:
```
F=F[+F]F[-F][F]
```

## License

MIT License - feel free to use this code for any purpose.

## Contributing

Contributions are welcome! Feel free to submit issues and pull requests. 