/**
 * City → coordinates for the public Orbit map (unifesto.app/orbit). A campus
 * Space's free-text `city` is matched against this list; unknown cities still
 * count in the totals, they just get no dot. Add a row when a new campus city
 * shows up unplaced.
 */
const CITIES: [name: string, lon: number, lat: number, aliases?: string[]][] = [
  // Telangana and Andhra Pradesh
  ["Hyderabad", 78.4867, 17.385, ["secunderabad", "medchal", "maisammaguda", "kompally", "ghatkesar", "gachibowli", "hitech city", "rangareddy", "ranga reddy", "medchal malkajgiri", "kukatpally", "uppal"]],
  ["Warangal", 79.5941, 17.9689, ["hanamkonda", "hanumakonda", "kazipet"]],
  ["Karimnagar", 79.1288, 18.4386],
  ["Nizamabad", 78.0941, 18.6725],
  ["Khammam", 80.1514, 17.2473],
  ["Nalgonda", 79.2671, 17.0575],
  ["Mahbubnagar", 77.9864, 16.7488, ["mahabubnagar"]],
  ["Siddipet", 78.8521, 18.1018],
  ["Vijayawada", 80.648, 16.5062, ["amaravati", "mangalagiri", "vaddeswaram"]],
  ["Guntur", 80.4365, 16.3067],
  ["Visakhapatnam", 83.2185, 17.6868, ["vizag", "vishakhapatnam"]],
  ["Tirupati", 79.4192, 13.6288],
  ["Nellore", 79.9865, 14.4426],
  ["Kakinada", 82.2475, 16.9891],
  ["Rajahmundry", 81.804, 17.0005, ["rajamahendravaram"]],
  ["Kurnool", 78.0373, 15.8281],
  ["Anantapur", 77.6006, 14.6819, ["anantapuramu"]],
  ["Kadapa", 78.8242, 14.4673],
  ["Eluru", 81.0952, 16.7107],
  ["Ongole", 80.0499, 15.5057],
  ["Srikakulam", 83.8938, 18.2949],
  ["Vizianagaram", 83.3956, 18.1067],
  ["Bhimavaram", 81.5212, 16.5449],
  // South
  ["Bengaluru", 77.5946, 12.9716, ["bangalore"]],
  ["Mysuru", 76.6394, 12.2958, ["mysore"]],
  ["Mangaluru", 74.856, 12.9141, ["mangalore"]],
  ["Manipal", 74.7856, 13.3525, ["udupi"]],
  ["Hubballi", 75.124, 15.3647, ["hubli", "dharwad"]],
  ["Belagavi", 74.4977, 15.8497, ["belgaum"]],
  ["Chennai", 80.2707, 13.0827, ["madras", "kattankulathur", "tambaram"]],
  ["Coimbatore", 76.9558, 11.0168],
  ["Madurai", 78.1198, 9.9252],
  ["Tiruchirappalli", 78.7047, 10.7905, ["trichy"]],
  ["Vellore", 79.1325, 12.9165],
  ["Salem", 78.146, 11.6643],
  ["Puducherry", 79.8083, 11.9416, ["pondicherry"]],
  ["Kochi", 76.2673, 9.9312, ["cochin", "ernakulam"]],
  ["Thiruvananthapuram", 76.9366, 8.5241, ["trivandrum"]],
  ["Kozhikode", 75.7804, 11.2588, ["calicut"]],
  ["Thrissur", 76.2144, 10.5276],
  // West
  ["Mumbai", 72.8777, 19.076, ["bombay", "navi mumbai", "thane"]],
  ["Pune", 73.8567, 18.5204, ["pimpri chinchwad"]],
  ["Nagpur", 79.0882, 21.1458],
  ["Nashik", 73.7898, 19.9975],
  ["Chhatrapati Sambhajinagar", 75.3433, 19.8762, ["aurangabad"]],
  ["Ahmedabad", 72.5714, 23.0225, ["gandhinagar"]],
  ["Vadodara", 73.1812, 22.3072, ["baroda"]],
  ["Surat", 72.8311, 21.1702],
  ["Rajkot", 70.8022, 22.3039],
  ["Goa", 73.8278, 15.4909, ["panaji", "panjim", "margao"]],
  // North
  ["New Delhi", 77.209, 28.6139, ["delhi"]],
  ["Noida", 77.391, 28.5355, ["greater noida"]],
  ["Gurugram", 77.0266, 28.4595, ["gurgaon"]],
  ["Faridabad", 77.3178, 28.4089],
  ["Ghaziabad", 77.4538, 28.6692],
  ["Chandigarh", 76.7794, 30.7333, ["mohali", "panchkula", "kharar"]],
  ["Ludhiana", 75.8573, 30.901],
  ["Amritsar", 74.8723, 31.634],
  ["Jalandhar", 75.5762, 31.326, ["phagwara"]],
  ["Patiala", 76.3869, 30.3398],
  ["Dehradun", 78.0322, 30.3165],
  ["Roorkee", 77.8956, 29.8543],
  ["Shimla", 77.1734, 31.1048],
  ["Jammu", 74.857, 32.7266],
  ["Srinagar", 74.7973, 34.0837],
  ["Leh", 77.5771, 34.1526],
  ["Jaipur", 75.7873, 26.9124],
  ["Kota", 75.8648, 25.2138],
  ["Jodhpur", 73.0243, 26.2389],
  ["Udaipur", 73.7125, 24.5854],
  ["Lucknow", 80.9462, 26.8467],
  ["Kanpur", 80.3319, 26.4499],
  ["Varanasi", 82.9739, 25.3176],
  ["Prayagraj", 81.8463, 25.4358, ["allahabad"]],
  ["Agra", 78.0081, 27.1767],
  // Central and East
  ["Bhopal", 77.4126, 23.2599],
  ["Indore", 75.8577, 22.7196],
  ["Gwalior", 78.1828, 26.2183],
  ["Jabalpur", 79.9864, 23.1815],
  ["Raipur", 81.6296, 21.2514, ["bhilai", "durg"]],
  ["Patna", 85.1376, 25.5941],
  ["Ranchi", 85.3096, 23.3441],
  ["Jamshedpur", 86.2029, 22.8046],
  ["Dhanbad", 86.4304, 23.7957],
  ["Kolkata", 88.3639, 22.5726, ["calcutta", "howrah", "salt lake"]],
  ["Kharagpur", 87.3105, 22.346],
  ["Durgapur", 87.3119, 23.5204],
  ["Bhubaneswar", 85.8245, 20.2961, ["cuttack"]],
  ["Rourkela", 84.8536, 22.2604],
  // Northeast
  ["Guwahati", 91.7362, 26.1445],
  ["Shillong", 91.8933, 25.5788],
  ["Imphal", 93.9368, 24.817],
  ["Agartala", 91.2868, 23.8315],
  ["Aizawl", 92.7176, 23.7271],
  ["Itanagar", 93.6053, 27.0844],
  ["Gangtok", 88.6138, 27.3389],
  ["Kohima", 94.1086, 25.6751],
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

const INDEX = new Map<string, { city: string; lon: number; lat: number }>();
for (const [city, lon, lat, aliases = []] of CITIES) {
  for (const key of [city, ...aliases]) INDEX.set(norm(key), { city, lon, lat });
}

/** The known city a free-text Space city refers to, or null. Tries the whole
 *  string, then each comma-separated part ("Medchal, Hyderabad"). */
export function findIndianCity(raw: string | null | undefined) {
  if (!raw) return null;
  const whole = INDEX.get(norm(raw));
  if (whole) return whole;
  for (const part of raw.split(/[,/]/)) {
    const hit = INDEX.get(norm(part));
    if (hit) return hit;
  }
  return null;
}
