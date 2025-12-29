import numpy as np
import matplotlib.pyplot as plt
for x in np.linspace(-np.pi, np.pi, 8):
    ys = np.linspace(-np.pi, np.pi, 100)
    xs = np.full(ys.shape, x)
    plt.plot(np.cos(ys), np.cos(xs))
for y in np.linspace(-np.pi, np.pi, 8):
    xs = np.linspace(-np.pi, np.pi, 100)
    ys = np.full(xs.shape, y)
    plt.plot(np.cos(ys), np.cos(xs))
plt.show()
