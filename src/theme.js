// src/theme.js
import { createTheme } from "@mui/material/styles";

export const lightTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#535bf2",
    },
    secondary: {
      main: "#646cff",
    },
    background: {
      default: "#f5f5f5",
      paper: "#ffffff",
    },
  },
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: "none",
          "& .MuiDataGrid-cell:focus": {
            outline: "none",
          },
          "& .MuiDataGrid-cell:focus-within": {
            outline: "none",
          },
        },
      },
    },
  },
});

export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#535bf2",
    },
    secondary: {
      main: "#646cff",
    },
    background: {
      default: "#1a1a1a",
      paper: "#242424",
    },
  },
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: {
          border: "none",
          "& .MuiDataGrid-cell:focus": {
            outline: "none",
          },
          "& .MuiDataGrid-cell:focus-within": {
            outline: "none",
          },
        },
      },
    },
  },
});
