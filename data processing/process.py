import pandas as pd
import numpy as np

# Read and process CSV1 (ward data)
ward_df = pd.read_csv('csv1.csv', usecols=[
    'Ward Name', 'Borough', 'Population', 'IMD average score', 'Income score', 'Employment score'
]).rename(columns={'Ward Name': 'WardName'})

# Read and combine crime data
crime_df1 = pd.read_csv('csv2.csv')
crime_df2 = pd.read_csv('csv3.csv')
crime_df = pd.concat([crime_df1, crime_df2], ignore_index=True)

# Melt crime data to long format
id_vars = ['WardName', 'MajorText', 'MinorText']
value_vars = [col for col in crime_df.columns if col.isdigit()]
melted = pd.melt(crime_df, id_vars=id_vars, value_vars=value_vars, 
                 var_name='YearMonth', value_name='Count')

# Calculate total crimes per ward for crime rate
total_crimes = melted.groupby('WardName')['Count'].sum().reset_index()
merged_df = pd.merge(ward_df, total_crimes, on='WardName', how='inner')
merged_df['CrimeRatePerCapita'] = (merged_df['Count'] / merged_df['Population']).round(2)

# Handle divisions and filter invalid values
merged_df['CrimeRatePerCapita'] = (
    merged_df['CrimeRatePerCapita']
    .replace([np.inf, -np.inf], np.nan)  # Handle division by zero
    .round(2)
)

# Drop wards with uncalculable crime rates
merged_df = merged_df.dropna(subset=['CrimeRatePerCapita'])
merged_df = merged_df.drop(columns='Count')

# Process crime data for type-year counts
melted['Year'] = melted['YearMonth'].str[:4]
grouped = melted.groupby(['WardName', 'MajorText', 'Year'])['Count'].sum().reset_index()

# Pivot to wide format for crime types per year
pivoted = grouped.pivot_table(index='WardName', 
                             columns=['MajorText', 'Year'], 
                             values='Count',
                             fill_value=0).reset_index()

# Flatten multi-index columns
pivoted.columns = [f'{maj}_{yr}' if maj != 'WardName' else 'WardName' 
                   for maj, yr in pivoted.columns]

# Merge final data
final_df = pd.merge(merged_df, pivoted, on='WardName', how='left')

# Fill missing crime data with 0
crime_columns = [col for col in pivoted.columns if col != 'WardName']
final_df[crime_columns] = final_df[crime_columns].fillna(0)

# Save to CSV
final_df.to_csv('combined_data.csv', index=False)