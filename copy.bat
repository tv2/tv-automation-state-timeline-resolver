
COPY ..\LICENSE .\
COPY ..\src\types\package.json .\

DEL /S /Q dist
COPY ..\src\types\dist .\dist
